"""Buyer purchase requests and launch-time matching into one negotiation room per eligible product."""

from datetime import timedelta

from sqlalchemy import select

from ..db import now
from ..errors import require
from ..models import Product, PurchaseRequest, Room, Workspace
from ..policies import match_reasons, validate_request_policy
from .core import event, room_event


def request_for(a, request_id):
    a.need("requests:write", "buyer")
    r = a.db.get(PurchaseRequest, request_id)
    require(
        r is not None and r.workspace_id == a.workspace.id,
        "request_not_found",
        "Purchase request not found",
        404,
    )
    return r


def request_view(r, public=False):
    data = dict(r.data)
    if public:
        data = {
            k: data[k]
            for k in ("category", "quantity", "material", "stackable", "destination", "latest_delivery")
        }
        data["title"] = f"{data['quantity']} {data['category']} for {data['destination']}"
    return {
        **data,
        "id": r.id,
        "workspace_id": r.workspace_id,
        "state": r.state,
        "version": r.version,
        "created_at": r.created_at.isoformat(),
        **({} if public else {"matches": r.matches}),
    }


def create_request(a, data):
    a.need("requests:write", "buyer")
    values = data.model_dump(mode="json")
    require(
        values["latest_delivery"] >= now().date().isoformat(),
        "invalid_deadline",
        "Deadline cannot be in the past",
        422,
    )
    validate_request_policy(a.db, a.workspace.id, values)
    r = PurchaseRequest(workspace_id=a.workspace.id, data=values)
    a.db.add(r)
    a.db.flush()
    event(a.db, a.workspace.id, a.credential.id, "request_created", r.id)
    return request_view(r)


def update_request(a, request_id, data):
    r = request_for(a, request_id)
    require(
        r.state in ("draft", "no_match"),
        "invalid_state",
        "Only a draft or unmatched request can be edited",
        409,
    )
    values = data.model_dump(mode="json")
    require(
        values.pop("expected_version") == r.version, "stale_version", "Refresh request before editing", 409
    )
    validate_request_policy(a.db, a.workspace.id, values)
    require(
        values["latest_delivery"] >= now().date().isoformat(),
        "invalid_deadline",
        "Deadline cannot be in the past",
        422,
    )
    r.data, r.state, r.matches = values, "draft", []
    r.version += 1
    event(a.db, a.workspace.id, a.credential.id, "request_updated", r.id)
    return request_view(r)


def launch(a, request_id):
    r = request_for(a, request_id)
    require(r.state == "draft", "invalid_state", "Only a draft can be launched", 409)
    validate_request_policy(a.db, a.workspace.id, r.data)
    matches, selected = [], []
    for p in a.db.scalars(
        select(Product)
        .where(Product.published.is_(True), Product.workspace_id != a.workspace.id)
        .order_by(Product.id)
    ):
        issues = match_reasons(p, r)
        matches.append(
            {
                "product_id": p.id,
                "supplier": a.db.get(Workspace, p.workspace_id).name,
                "eligible": not issues,
                "reasons": issues or ["Stock, specifications and delivery match"],
            }
        )
        if not issues:
            selected.append(p)
    require(
        len(selected) <= 50, "too_many_matches", "Narrow the request to at most 50 eligible products", 422
    )
    r.matches, r.state = matches, "negotiating" if selected else "no_match"
    r.version += 1
    for p in selected:
        room = Room(
            request_id=r.id, seller_id=p.workspace_id, product_id=p.id, expires_at=now() + timedelta(hours=48)
        )
        a.db.add(room)
        a.db.flush()
        room_event(a.db, room, a.credential.id, "negotiation_opened")
    event(a.db, a.workspace.id, a.credential.id, "request_launched", r.id, {"eligible": len(selected)})
    return request_view(r)
