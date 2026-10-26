"""Commercial state transitions. Call mutation() before every business write.

The local deployment serializes short commercial transactions with a PostgreSQL
advisory lock. No external agent/model execution occurs under this lock. Row locks,
stock checks and unique constraints additionally protect order creation.

Modules, in dependency order:
    core               lock, audit events, idempotent replay, request state roll-up
    catalogue          products, stock, images; product changes invalidate open offers
    rules              private buyer/seller commercial rules
    purchase_requests  buyer requests and launch-time matching into negotiation rooms
    rooms              room access, offer validity and the participant view
    guidance           "Negotiate more": a human reopens a bounded round for their agent
    negotiation        agent turn claims, typed actions and agent context
    approvals          dual human approval, order creation and stock allocation
"""

from .approvals import approve, order_view
from .catalogue import (
    create_product,
    image_view,
    invalidate_product,
    product_for,
    product_view,
    snapshot_product,
    update_product,
    update_stock,
)
from .core import clear_claim, event, mutation, once, refresh_request, room_event
from .guidance import request_guidance
from .negotiation import claim, context, submit_action
from .purchase_requests import create_request, launch, request_for, request_view, update_request
from .rooms import room_for, room_view
from .rules import rules_view, set_rules

__all__ = [
    "approve",
    "claim",
    "clear_claim",
    "context",
    "create_product",
    "create_request",
    "event",
    "image_view",
    "invalidate_product",
    "launch",
    "mutation",
    "once",
    "order_view",
    "product_for",
    "product_view",
    "refresh_request",
    "request_for",
    "request_guidance",
    "request_view",
    "room_event",
    "room_for",
    "room_view",
    "rules_view",
    "set_rules",
    "snapshot_product",
    "submit_action",
    "update_product",
    "update_request",
    "update_stock",
]
