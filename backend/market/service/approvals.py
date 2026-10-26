"""Dual human approval of one exact offer, then order creation and stock allocation."""

from sqlalchemy import delete, select

from ..db import now
from ..errors import require
from ..models import Allocation, Approval, Offer, Order, Room, Workspace
from .catalogue import invalidate_product, snapshot_product
from .core import clear_claim, refresh_request, room_event
from .rooms import offer_issues, offer_view, room_for


def approve(a, room_id, data, reject=False):
    a.human()
    room, r, p = room_for(a, room_id)
    existing = a.db.scalar(select(Order).where(Order.request_id == r.id))
    if existing:
        require(
            not reject and existing.offer_id == data.offer_id and existing.room_id == room.id,
            "already_ordered",
            "This request already has a confirmed order",
            409,
        )
        return {"state": "ordered", "order": order_view(existing)}
    require(
        room.state == "awaiting_approval"
        and room.current_offer_id == data.offer_id
        and room.version == data.expected_version,
        "stale_offer",
        "Review the exact current approval-stage offer before deciding",
        409,
    )
    offer = a.db.get(Offer, data.offer_id)
    if reject:
        a.db.execute(delete(Approval).where(Approval.offer_id == offer.id))
        room.state, room.reason = "declined", "A human rejected the proposed deal"
        room.version += 1
        room_event(a.db, room, a.user.id, "human_rejected", {"offer_id": offer.id})
        refresh_request(a.db, r)
        return {"state": room.state, "order": None}
    require(
        room.expires_at > now() and not offer_issues(a.db, offer, room, r, p),
        "offer_invalid",
        "Offer, policies or availability changed; a new offer and approvals are required",
        409,
    )
    if a.role == "buyer":
        if r.selected_offer_id and r.selected_offer_id != offer.id:
            a.db.execute(delete(Approval).where(Approval.offer_id == r.selected_offer_id))
        r.selected_offer_id = offer.id
    prior = a.db.scalar(
        select(Approval).where(Approval.offer_id == offer.id, Approval.workspace_id == a.workspace.id)
    )
    if not prior:
        a.db.add(Approval(offer_id=offer.id, workspace_id=a.workspace.id, user_id=a.user.id))
        room_event(a.db, room, a.user.id, "human_approved", {"offer_id": offer.id, "role": a.role})
    a.db.flush()
    approvals = list(a.db.scalars(select(Approval).where(Approval.offer_id == offer.id)))
    if {x.workspace_id for x in approvals} != {
        r.workspace_id,
        room.seller_id,
    } or r.selected_offer_id != offer.id:
        return {"state": "awaiting_approval", "order": None}
    # Explicit row lock and a unique order/request constraint protect stock/order integrity.
    a.db.refresh(p, with_for_update=True)
    require(
        p.stock >= offer.terms["quantity"], "stock_changed", "Insufficient stock; obtain a revised offer", 409
    )
    p.stock -= offer.terms["quantity"]
    p.version += 1
    snapshot_product(a.db, p)
    order = Order(
        request_id=r.id,
        room_id=room.id,
        offer_id=offer.id,
        buyer_id=r.workspace_id,
        seller_id=room.seller_id,
        snapshot={
            "offer": offer_view(a.db, offer),
            "buyer": a.db.get(Workspace, r.workspace_id).name,
            "seller": a.db.get(Workspace, room.seller_id).name,
            "status": "confirmed_demo",
        },
    )
    a.db.add(order)
    a.db.flush()
    a.db.add(Allocation(order_id=order.id, product_id=p.id, quantity=offer.terms["quantity"]))
    room.state, r.state = "ordered", "ordered"
    for rival in a.db.scalars(select(Room).where(Room.request_id == r.id, Room.id != room.id)):
        if rival.state != "ordered":
            rival.state, rival.reason = "cancelled", "Another supplier was selected"
            rival.version += 1
            clear_claim(rival)
            if rival.current_offer_id:
                a.db.execute(delete(Approval).where(Approval.offer_id == rival.current_offer_id))
    invalidate_product(a.db, p.id, "Stock allocated to another order; revise and reapprove")
    room_event(a.db, room, a.user.id, "order_confirmed", {"order_id": order.id})
    return {"state": "ordered", "order": order_view(order)}


def order_view(order):
    return {
        "id": order.id,
        "request_id": order.request_id,
        "room_id": order.room_id,
        "buyer_id": order.buyer_id,
        "seller_id": order.seller_id,
        "created_at": order.created_at.isoformat(),
        **order.snapshot,
    }
