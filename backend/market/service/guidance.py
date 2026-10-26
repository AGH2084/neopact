"""Private human guidance ("Negotiate more"): a person reopens a bounded round for their own agent."""

from datetime import timedelta

from sqlalchemy import delete, select

from ..db import now
from ..errors import require
from ..models import Approval, Event, HumanGuidance, OfferInvalidation
from .core import clear_claim, refresh_request, room_event
from .rooms import guidance_available, room_for, room_view


def pending_guidance(a, room):
    return a.db.scalar(
        select(HumanGuidance).where(
            HumanGuidance.room_id == room.id,
            HumanGuidance.workspace_id == a.workspace.id,
            HumanGuidance.status == "pending",
        )
    )


def restart_from_human(a, room, request, reason):
    if room.current_offer_id:
        if not a.db.get(OfferInvalidation, room.current_offer_id):
            a.db.add(OfferInvalidation(offer_id=room.current_offer_id, reason=reason))
        a.db.execute(delete(Approval).where(Approval.offer_id == room.current_offer_id))
        if request.selected_offer_id == room.current_offer_id:
            request.selected_offer_id = None
    room.run += 1
    room.version += 1
    room.state = "needs_revision" if room.current_offer_id else "negotiating"
    room.next_role, room.reason = a.role, reason
    room.expires_at = now() + timedelta(hours=48)
    clear_claim(room)


def human_opening_authorized(a, room):
    # This permission survives acknowledgement by an intervening dialogue turn.
    return (
        a.role == "seller"
        or a.db.scalar(
            select(Event.id)
            .where(
                Event.workspace_id == a.workspace.id,
                Event.resource_id == room.id,
                Event.type == "human_requested_negotiation",
                Event.data["role"].as_string() == a.role,
                Event.data["run"].as_integer() == room.run,
            )
            .limit(1)
        )
        is not None
    )


def request_guidance(a, room_id, data):
    a.human()
    room, request, product = room_for(a, room_id)
    require(
        data.expected_version == room.version,
        "stale_version",
        "Refresh the negotiation before sending guidance",
        409,
    )
    require(
        guidance_available(room, request, product),
        "invalid_state",
        "This negotiation cannot be reopened with the current request and product availability",
        409,
    )
    pending = pending_guidance(a, room)
    if pending:
        pending.status = "superseded"
        a.db.flush()
    reason = "A human requested further negotiation; a new offer and both approvals are required"
    restart_from_human(a, room, request, reason)
    guidance = HumanGuidance(
        room_id=room.id,
        workspace_id=a.workspace.id,
        user_id=a.user.id,
        role=a.role,
        instruction=data.instruction,
        run=room.run,
    )
    a.db.add(guidance)
    a.db.flush()
    # Public audit metadata deliberately excludes instruction text and guidance IDs.
    room_event(a.db, room, a.user.id, "human_requested_negotiation", {"role": a.role, "run": room.run})
    refresh_request(a.db, request)
    return room_view(a, room, request, product)
