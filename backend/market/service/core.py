"""Shared write primitives: the global commercial lock, audit events and idempotent replay."""

import json

from sqlalchemy import select, text

from ..auth import digest
from ..errors import require
from ..models import Event, Idempotency, PurchaseRequest, Room


def mutation(db):
    db.execute(text("SELECT pg_advisory_xact_lock(782374912)"))


def event(db, workspace_id, actor_id, kind, resource, data=None):
    db.add(
        Event(workspace_id=workspace_id, actor_id=actor_id, type=kind, resource_id=resource, data=data or {})
    )


def room_event(db, room, actor_id, kind, data=None):
    request = db.get(PurchaseRequest, room.request_id)
    for workspace in (request.workspace_id, room.seller_id):
        event(db, workspace, actor_id, kind, room.id, data)


def once(a, key, operation, payload, callback):
    require(
        key and 8 <= len(key) <= 128,
        "idempotency_key_required",
        "Supply an Idempotency-Key of 8–128 characters",
        422,
    )
    fingerprint = digest(json.dumps(payload, sort_keys=True, default=str))
    prior = a.db.get(Idempotency, (a.credential.id, key))
    if prior:
        require(
            prior.operation == operation and prior.request_hash == fingerprint,
            "idempotency_conflict",
            "This key was already used for a different operation",
            409,
        )
        return prior.result
    result = callback()
    a.db.add(
        Idempotency(
            credential_id=a.credential.id,
            key=key,
            operation=operation,
            request_hash=fingerprint,
            result=result,
        )
    )
    return result


def clear_claim(room):
    room.claim_credential_id = room.claim_token_hash = room.claim_until = None


def refresh_request(db, r):
    if r.state in ("ordered", "cancelled"):
        return
    db.flush()
    states = list(db.scalars(select(Room.state).where(Room.request_id == r.id)))
    r.state = (
        "awaiting_approval"
        if "awaiting_approval" in states
        else "negotiating"
        if any(s in ("negotiating", "needs_revision") for s in states)
        else "needs_human_review"
        if "needs_human_review" in states
        else "declined"
    )
