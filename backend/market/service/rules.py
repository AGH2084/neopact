"""Private commercial rules (buyer budgets, seller floors). Tightening or loosening them invalidates offers."""

from sqlalchemy import select

from ..errors import require
from ..models import Policy, Product, PurchaseRequest, Room
from ..policies import effective, policy_rows
from ..schemas import BuyerPolicy, SellerPolicy
from .catalogue import invalidate_product, invalidate_room, product_for
from .core import event


def rules_view(a, product_id=None):
    if product_id:
        p = product_for(a, product_id)
        require(
            a.role == "seller" and p.workspace_id == a.workspace.id,
            "permission_denied",
            "Supplier rules are private",
            403,
        )
    rules, versions = effective(a.db, a.workspace.id, a.role, product_id)
    rows = policy_rows(a.db, a.workspace.id, product_id or "workspace")
    return {
        "role": a.role,
        "target": product_id or "workspace",
        "version": rows[-1].version if rows else 0,
        "rules": rows[-1].data
        if rows
        else (BuyerPolicy() if a.role == "buyer" else SellerPolicy()).model_dump(),
        "effective": rules,
        "versions": versions,
    }


def set_rules(a, data, product_id=None):
    a.need("policies:write")
    current = rules_view(a, product_id)
    require(
        current["version"] == data.expected_version, "stale_version", "Refresh policy before editing", 409
    )
    rules = (BuyerPolicy if a.role == "buyer" else SellerPolicy).model_validate(data.rules).model_dump()
    if product_id:
        base, _ = effective(a.db, a.workspace.id, "seller")
        require(
            all(v <= base[k] if k.startswith("max_") else v >= base[k] for k, v in rules.items()),
            "policy_violation",
            "Product rules cannot weaken workspace limits",
            422,
        )
    p = Policy(
        workspace_id=a.workspace.id,
        target=product_id or "workspace",
        version=data.expected_version + 1,
        data=rules,
    )
    a.db.add(p)
    if a.role == "seller":
        products = (
            [product_id]
            if product_id
            else list(a.db.scalars(select(Product.id).where(Product.workspace_id == a.workspace.id)))
        )
        for pid in products:
            invalidate_product(a.db, pid, "Supplier policies changed")
    else:
        ids = select(PurchaseRequest.id).where(PurchaseRequest.workspace_id == a.workspace.id)
        for room in a.db.scalars(select(Room).where(Room.request_id.in_(ids))):
            invalidate_room(a.db, room, "Buyer policies changed")
    event(
        a.db,
        a.workspace.id,
        a.credential.id,
        "policy_updated",
        product_id or a.workspace.id,
        {"version": p.version},
    )
    a.db.flush()
    return rules_view(a, product_id)
