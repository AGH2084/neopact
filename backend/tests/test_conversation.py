"""Natural dialogue remains private where required and commercially bounded."""

import pytest
from response_helpers import response_data
from test_guidance import read_room, terms
from test_marketplace import BASE, action, launch, user

from market.config import settings


def setup(client):
    buyer, seller = user(client, "buyer", True), user(client, "forma", True)
    _, rooms = launch(client, buyer)
    return buyer, seller, next(r for r in rooms if r["product_id"] == "prod-forma")


def say(client, headers, room, text, purpose="question", **kwargs):
    return action(client, headers, room["id"], "message", message=text, purpose=purpose, **kwargs)


def test_dialogue_replies_offer_explanations_and_own_revision(client):
    buyer, seller, room = setup(client)
    assert say(client, seller, room, "Which matters more: deposit or delivery?").status_code == 200
    messages = response_data(client.get(BASE + f"/negotiations/{room['id']}/messages", headers=buyer))
    first = messages["items"][0]
    assert first["run"] == 1 and first["type"] == "message"
    assert (
        say(
            client, buyer, room, "A lower deposit matters most.", "answer", reply_to_action_id=first["id"]
        ).status_code
        == 200
    )
    proposal = action(
        client,
        seller,
        room["id"],
        "propose",
        terms=terms(8400),
        message="This quote keeps the delivery date and a 30 percent deposit.",
        purpose="explanation",
    )
    assert proposal.status_code == 200, proposal.text
    assert say(client, buyer, room, "Could you improve the unit price?", "tradeoff").status_code == 200
    context = read_room(client, seller, room)
    assert "revise" in context["allowed_actions"] and "counter" not in context["allowed_actions"]
    result = action(
        client,
        seller,
        room["id"],
        "revise",
        terms=terms(),
        message="I can improve the unit price.",
        purpose="explanation",
    )
    assert result.status_code == 200
    current = read_room(client, buyer, room)
    assert len(current["offers"]) == 2 and current["version"] == 5
    assert current["state"] == "negotiating"
    assert (
        action(client, buyer, room["id"], "accept", offer_id=current["current_offer"]["id"]).status_code
        == 200
    )
    path = BASE + f"/negotiations/{room['id']}/messages"
    page = response_data(client.get(path + "?limit=2&offset=1&run=1", headers=buyer))
    assert page["total"] == 5 and len(page["items"]) == 2
    assert response_data(client.get(path + "?run=2", headers=buyer))["items"] == []
    assert client.get(path, headers=user(client, "nord", True)).status_code == 404
    assert client.post(BASE + f"/negotiations/{room['id']}/claim", headers=seller).status_code == 409


def test_message_cannot_create_an_agreement_or_expand_terms(client):
    buyer, seller, room = setup(client)
    assert (
        say(
            client, seller, room, "I accept this deal with free assembly and a lifetime warranty."
        ).status_code
        == 200
    )
    context = read_room(client, buyer, room)
    assert context["state"] == "negotiating" and context["current_offer"] is None
    assert response_data(client.get(BASE + "/orders", headers=buyer))["items"] == []
    bad = action(
        client, buyer, room["id"], "message", message="Our agreed terms", purpose="explanation", terms=terms()
    )
    assert bad.status_code == 422


def test_message_budget_is_separate_from_structured_offer_budget(client, monkeypatch):
    buyer, seller, room = setup(client)
    monkeypatch.setattr(settings, "max_conversation_turns", 2)
    assert say(client, seller, room, "What do you need?").status_code == 200
    assert say(client, buyer, room, "A better price.", "answer").status_code == 200
    context = read_room(client, seller, room)
    assert context["limits"]["conversation_turns_remaining"] == 0
    assert "message" not in context["allowed_actions"] and "propose" in context["allowed_actions"]
    path = BASE + f"/negotiations/{room['id']}"
    claim = response_data(client.post(path + "/claim", headers=seller))
    payload = {
        "type": "message",
        "message": "An extra message",
        "purpose": "question",
        "claim_token": claim["claim_token"],
        "expected_version": claim["expected_version"],
    }
    rejected = client.post(path + "/actions", headers=seller, json=payload)
    assert rejected.status_code == 409 and response_data(rejected)["error"]["code"] == "conversation_limit"
    result = client.post(
        path + "/actions",
        headers=seller,
        json={
            "type": "propose",
            "terms": terms(),
            "claim_token": claim["claim_token"],
            "expected_version": claim["expected_version"],
        },
    )
    assert result.status_code == 200


@pytest.mark.parametrize("reference", ["reply", "image"])
def test_message_rejects_unknown_or_cross_room_references(client, reference):
    buyer, seller, room = setup(client)
    if reference == "reply":
        _, rooms = launch(client, buyer)
        other = next(r for r in rooms if r["product_id"] == "prod-forma")
        assert say(client, seller, other, "A private room conversation").status_code == 200
        row = response_data(client.get(BASE + f"/negotiations/{other['id']}/messages", headers=seller))[
            "items"
        ][0]
        response = say(
            client, seller, room, "Answer from another room", "answer", reply_to_action_id=row["id"]
        )
    else:
        response = say(client, seller, room, "See this photo", image_ids=["unknown-image"])
    assert response.status_code == 422


def test_revise_counts_toward_counter_limit(client, monkeypatch):
    buyer, seller, room = setup(client)
    monkeypatch.setattr(settings, "max_counteroffers", 1)
    assert action(client, seller, room["id"], "propose", terms=terms()).status_code == 200
    assert say(client, buyer, room, "Can you improve?").status_code == 200
    assert action(client, seller, room["id"], "revise", terms=terms()).status_code == 200
    assert say(client, buyer, room, "One more change?").status_code == 200
    context = read_room(client, seller, room)
    assert context["limits"]["offer_actions_remaining"] == 0 and "revise" not in context["allowed_actions"]
    response = action(client, seller, room["id"], "revise", terms=terms())
    assert response.status_code == 409 and response_data(response)["error"]["code"] == "round_limit"
