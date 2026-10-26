"""Seller products, stock and image views. Any product change invalidates open offers on it."""

from sqlalchemy import delete, select

from ..errors import require
from ..models import (
    Approval,
    Image,
    OfferInvalidation,
    Product,
    ProductRevision,
    PurchaseRequest,
    Room,
    Workspace,
)
from .core import clear_claim, event, refresh_request, room_event


def image_view(image):
    return {
        "id": image.id,
        "product_id": image.product_id,
        "status": image.status,
        "mime": image.mime,
        "width": image.width,
        "height": image.height,
        "sha256": image.checksum,
        "position": image.position,
        "caption": image.caption,
        "error": image.error,
        "content_path": f"/images/{image.id}/content",
        "thumbnail_path": f"/images/{image.id}/content?thumbnail=true",
    }


def product_view(db, p, own=False):
    images = list(
        db.scalars(
            select(Image)
            .where(Image.product_id == p.id, Image.status != "deleted")
            .order_by(Image.position, Image.id)
        )
    )
    return {
        **p.data,
        "id": p.id,
        "workspace_id": p.workspace_id,
        "supplier": db.get(Workspace, p.workspace_id).name,
        "sku": p.sku,
        "stock": p.stock,
        "version": p.version,
        "published": p.published,
        "cover_id": p.cover_id,
        "images": [image_view(i) for i in images if own or i.status == "ready"],
    }


def product_for(a, product_id, write=False):
    a.need("products:write" if write else "catalogue:read", "seller" if write else None)
    p = a.db.get(Product, product_id)
    require(
        p is not None and (p.workspace_id == a.workspace.id or (not write and p.published)),
        "product_not_found",
        "Product not found in the permitted catalogue",
        404,
    )
    return p


def snapshot_product(db, p):
    db.flush()
    db.add(ProductRevision(product_id=p.id, version=p.version, data=product_view(db, p)))


def invalidate_room(db, room, reason):
    if room.state in ("ordered", "cancelled", "declined", "expired"):
        return
    if room.current_offer_id:
        if not db.get(OfferInvalidation, room.current_offer_id):
            db.add(OfferInvalidation(offer_id=room.current_offer_id, reason=reason))
        db.execute(delete(Approval).where(Approval.offer_id == room.current_offer_id))
    room.state, room.next_role, room.reason = "needs_revision", "seller", reason
    room.version += 1
    clear_claim(room)
    room_event(db, room, "system", "offer_invalidated", {"reason": reason})
    refresh_request(db, db.get(PurchaseRequest, room.request_id))


def invalidate_product(db, product_id, reason):
    for room in db.scalars(select(Room).where(Room.product_id == product_id)):
        invalidate_room(db, room, reason)


def create_product(a, data):
    a.need("products:write", "seller")
    values = data.model_dump(mode="json")
    p = Product(
        workspace_id=a.workspace.id,
        sku=values.pop("sku"),
        stock=values.pop("stock"),
        published=values.pop("published"),
        data=values,
    )
    a.db.add(p)
    a.db.flush()
    snapshot_product(a.db, p)
    event(a.db, a.workspace.id, a.credential.id, "product_created", p.id)
    return product_view(a.db, p, True)


def update_product(a, product_id, data):
    p = product_for(a, product_id, True)
    values = data.model_dump(mode="json")
    require(
        values.pop("expected_version") == p.version,
        "stale_version",
        "Refresh the product before editing",
        409,
    )
    p.sku, p.stock, p.published = values.pop("sku"), values.pop("stock"), values.pop("published")
    p.data = values
    p.version += 1
    invalidate_product(a.db, p.id, "Product, stock or published evidence changed")
    snapshot_product(a.db, p)
    event(a.db, a.workspace.id, a.credential.id, "product_updated", p.id, {"version": p.version})
    return product_view(a.db, p, True)


def update_stock(a, product_id, data):
    p = product_for(a, product_id, True)
    require(
        data.expected_version == p.version, "stale_version", "Refresh the product before editing stock", 409
    )
    p.stock = data.stock
    p.version += 1
    invalidate_product(a.db, p.id, "Inventory changed; revise the offer and collect new approvals")
    snapshot_product(a.db, p)
    event(a.db, a.workspace.id, a.credential.id, "inventory_updated", p.id, {"stock": p.stock})
    return product_view(a.db, p, True)
