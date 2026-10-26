"""Read side of a negotiation room: access checks, offer validity and the participant view."""

from sqlalchemy import select

from ..config import settings
from ..db import now
from ..errors import require
from ..models import (
    Action,
    Approval,
    Event,
    HumanGuidance,
    Offer,
    OfferInvalidation,
    Product,
    PurchaseRequest,
    Room,
    Workspace,
)
from ..policies import check_terms, effective, match_reasons
from .catalogue import product_view
from .purchase_requests import request_view


def room_for(a, room_id):
    a.need("negotiations:read")
    room = a.db.get(Room, room_id)
    require(room is not None, "negotiation_not_found", "Negotiation not found", 404)
    request = a.db.get(PurchaseRequest, room.request_id)
    require(
        (a.role == "buyer" and request.workspace_id == a.workspace.id)
        or (a.role == "seller" and room.seller_id == a.workspace.id),
        "negotiation_not_found",
        "Negotiation not found",
        404,
    )
    return room, request, a.db.get(Product, room.product_id)


def offer_issues(db, offer, room, request, product, side="both"):
    if not offer:
        return ["No offer yet"]
    issues = []
    invalid = db.get(OfferInvalidation, offer.id)
    if invalid:
        issues.append(invalid.reason)
    if offer.expires_at <= now():
        issues.append("Offer expired")
    if offer.product_snapshot["version"] != product.version:
        issues.append("Product changed; a new offer is required")
    for role, wid, pid in [("buyer", request.workspace_id, None), ("seller", room.seller_id, product.id)]:
        _, versions = effective(db, wid, role, pid)
        if offer.policy_versions[role] != versions:
            issues.append("Commercial policy changed; a new offer is required")
    issues += check_terms(db, product, request, offer.terms, side)
    return list(dict.fromkeys(issues))


def offer_view(db, offer, role=None):
    approvals = list(
        db.scalars(select(Approval).where(Approval.offer_id == offer.id).order_by(Approval.created_at))
    )
    return {
        "id": offer.id,
        "version": offer.version,
        "sender": offer.sender,
        "terms": offer.terms,
        "product": offer.product_snapshot,
        "expires_at": offer.expires_at.isoformat(),
        "created_at": offer.created_at.isoformat(),
        "approvals": [
            {"workspace_id": a.workspace_id, "user_id": a.user_id, "at": a.created_at.isoformat()}
            for a in approvals
        ],
    }


GUIDANCE_STATES = {
    "negotiating",
    "needs_revision",
    "awaiting_approval",
    "needs_human_review",
    "declined",
    "expired",
}


def guidance_available(room, request, product):
    return (
        room.state in GUIDANCE_STATES
        and request.state not in ("ordered", "cancelled")
        and not match_reasons(product, request)
    )


def room_view(a, room, request=None, product=None):
    db = a.db
    request = request or db.get(PurchaseRequest, room.request_id)
    product = product or db.get(Product, room.product_id)
    offers = list(db.scalars(select(Offer).where(Offer.room_id == room.id).order_by(Offer.version)))
    current = db.get(Offer, room.current_offer_id) if room.current_offer_id else None
    issues = offer_issues(db, current, room, request, product, a.role)
    history = list(db.scalars(select(Action).where(Action.room_id == room.id).order_by(Action.created_at)))
    activity = [
        {
            "id": x.id,
            "role": x.role,
            "type": x.type,
            "data": x.data,
            "at": x.created_at.isoformat(),
            "run": x.run,
        }
        for x in history
    ]
    for notice in db.scalars(
        select(Event).where(
            Event.workspace_id == a.workspace.id,
            Event.resource_id == room.id,
            Event.type == "human_requested_negotiation",
        )
    ):
        activity.append(
            {
                "id": notice.id,
                "role": notice.data["role"],
                "type": notice.type,
                "data": {"role": notice.data["role"], "run": notice.data["run"]},
                "at": notice.created_at.isoformat(),
                "run": notice.data["run"],
            }
        )
    guidance = list(
        db.scalars(
            select(HumanGuidance)
            .where(HumanGuidance.room_id == room.id, HumanGuidance.workspace_id == a.workspace.id)
            .order_by(HumanGuidance.created_at.desc(), HumanGuidance.id.desc())
        )
    )
    return {
        "id": room.id,
        "request_id": request.id,
        "seller_id": room.seller_id,
        "supplier": db.get(Workspace, room.seller_id).name,
        "product_id": product.id,
        "state": room.state,
        "version": room.version,
        "run": room.run,
        "next_role": room.next_role,
        "reason": room.reason,
        "expires_at": room.expires_at.isoformat(),
        "agent_status": "claimed" if room.claim_until and room.claim_until > now() else "waiting_for_agent",
        "request": request_view(request, public=a.role == "seller"),
        "product": product_view(db, product),
        "offers": [offer_view(db, o, a.role) for o in offers],
        "current_offer": offer_view(db, current, a.role) if current else None,
        "valid": not issues,
        "invalid_reasons": issues,
        "activity": sorted(activity, key=lambda x: (x["at"], x["id"])),
        "human_guidance": [
            {
                "id": g.id,
                "role": g.role,
                "instruction": g.instruction,
                "status": g.status,
                "run": g.run,
                "created_at": g.created_at.isoformat(),
                "applied_at": g.applied_at.isoformat() if g.applied_at else None,
            }
            for g in guidance
        ],
        "can_request_guidance": bool(
            a.browser
            and a.credential.kind == "browser"
            and a.membership.approver
            and guidance_available(room, request, product)
        ),
        "approval_url": f"{settings.frontend_url}/?view=approvals&room={room.id}",
    }
