"""Drive the real HTTP API as separately credentialed, scripted buyer and seller agents.

Creates a request and offers, never approves an order. No LLM calls. Does not reset data.
"""

import hashlib
import json
import os
from datetime import date, timedelta
from uuid import uuid4

import httpx

API = os.environ.get("MARKET_API_URL", "http://127.0.0.1:8100").rstrip("/") + "/api/v1"
PASSWORD = os.environ.get("DEMO_PASSWORD", "local-market-demo")


def payload(response):
    """Unwrap the {"<label>": value, "status_code": n} envelope."""
    response.raise_for_status()
    (value,) = (v for k, v in response.json().items() if k != "status_code")
    return value


def agent(name, scopes):
    """Sign in as the demo owner, issue a restricted agent credential and return a client using it."""
    with httpx.Client(base_url=API, trust_env=False) as c:
        owner = payload(c.post("/auth/token", json={"email": name + "@demo.local", "password": PASSWORD}))
        credential = payload(
            c.post(
                "/credentials",
                headers={"Authorization": "Bearer " + owner["token"]},
                json={"name": "Scripted agent demonstration", "scopes": scopes},
            )
        )
    return httpx.Client(
        base_url=API, trust_env=False, headers={"Authorization": "Bearer " + credential["token"]}
    )


def act(client, room_id, kind, **data):
    claimed = payload(client.post(f"/negotiations/{room_id}/claim"))
    action = {
        "type": kind,
        "expected_version": claimed["expected_version"],
        "claim_token": claimed["claim_token"],
        **data,
    }
    return payload(
        client.post(
            f"/negotiations/{room_id}/actions", json=action, headers={"Idempotency-Key": str(uuid4())}
        )
    )


def main():
    base = ["catalogue:read", "images:read", "negotiations:read", "negotiations:act", "orders:read"]
    buyer = agent("buyer", base + ["requests:write"])
    sellers = {name: agent(name, base) for name in ("forma", "nord")}

    assert payload(buyer.get("/agent/instructions"))["role"] == "buyer"
    assert payload(buyer.get("/products"))["total"] >= 3
    images = payload(buyer.get("/products/prod-forma/images"))["items"]
    for image in images:
        content = buyer.get(f"/images/{image['id']}/content")
        content.raise_for_status()
        assert hashlib.sha256(content.content).hexdigest() == image["sha256"]
    assert len(images) >= 2

    request = {
        "title": "80 chairs / scripted demonstration " + uuid4().hex[:6],
        "description": "80 stackable chairs for Sofia",
        "quantity": 80,
        "material": "polypropylene",
        "stackable": True,
        "destination": "Sofia",
        "latest_delivery": (date.today() + timedelta(days=14)).isoformat(),
        "max_total": 700000,
        "max_deposit_percent": 40,
        "preference": "lower_deposit",
    }
    r = payload(buyer.post("/requests", json=request, headers={"Idempotency-Key": str(uuid4())}))
    payload(buyer.post(f"/requests/{r['id']}/launch", headers={"Idempotency-Key": str(uuid4())}))
    rooms = payload(buyer.get(f"/requests/{r['id']}"))["negotiations"]

    for room in rooms:
        name = "forma" if room["product_id"] == "prod-forma" else "nord"
        terms = {
            "unit_price": 9500 if name == "forma" else 11000,
            "quantity": 80,
            "delivery_date": (date.today() + timedelta(days=12 if name == "forma" else 8)).isoformat(),
            "deposit_percent": 50,
        }
        act(sellers[name], room["id"], "propose", terms=terms)
        counter = act(
            buyer, room["id"], "counter", terms={**terms, "unit_price": 8300, "deposit_percent": 30}
        )
        if name == "forma":
            agreed = act(sellers[name], room["id"], "accept", offer_id=counter["offer_id"])
            room_id = room["id"]
        else:
            act(sellers[name], room["id"], "decline")

    comparison = payload(buyer.get(f"/requests/{r['id']}/compare"))
    assert comparison["best_fit_room_id"] == room_id
    print(
        json.dumps(
            {
                "request_id": r["id"],
                "room_id": room_id,
                "total": 688000,
                "image_files_verified": len(images),
                "status": "awaiting_human_approval",
                "approval_url": agreed["approval_url"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
