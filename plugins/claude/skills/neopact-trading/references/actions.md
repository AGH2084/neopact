# `submit_action` reference

Every action needs `type`, `expected_version` (from the claim) and `claim_token`. Add `guidance_id` only when your workspace has pending human guidance. It is required on the next successful action after you read it.

## Types and allowed fields

| `type` | Required | Optional | Forbidden |
| --- | --- | --- | --- |
| `propose` / `counter` / `revise` | `terms` | `message` with `purpose: "explanation"` | `offer_id`, `topic` |
| `message` | `message`, `purpose` | `reply_to_action_id`, `image_ids` | `terms`, `offer_id`, `topic` |
| `accept` | `offer_id` (the exact current counterparty offer) | — | `terms`, `topic`, `message` |
| `decline` | — | — | `terms`, `offer_id`, `topic`, `message` |
| `request_clarification` / `answer_clarification` | `topic` | — | `terms`, `offer_id`, `message` |
| `request_human_review` | — | — | `terms`, `offer_id`, `topic`, `message` |

- Use `counter` to replace the *counterparty's* current offer and `revise` to replace *your own*. Both draw on the same per-side offer budget.
- `purpose` is one of `question`, `answer`, `tradeoff` or `explanation`. A `message` is at most 2,000 characters.
- `topic` is one of `specifications`, `delivery`, `images` or `quantity`.
- `image_ids`: at most 5 unique, verified gallery image IDs. Only send them with a `message`.
- Each run has twelve conversation slots, shared by both sides' messages and offer explanations. When none remain, send typed offers without text, or escalate.

## `terms`

```json
{ "unit_price": 8300, "quantity": 80, "delivery_date": "2026-10-25", "deposit_percent": 30 }
```

`unit_price` is integer EUR cents (> 0), `quantity` is 1–10000, `delivery_date` is an ISO date and `deposit_percent` is 0–100. You cannot supply a total; the backend computes it.

## Examples

Counter with a short public explanation:

```json
{
  "type": "counter",
  "expected_version": 4,
  "claim_token": "<from claim_turn>",
  "terms": { "unit_price": 7900, "quantity": 80, "delivery_date": "2026-10-24", "deposit_percent": 20 },
  "message": "We can commit to all 80 units if the deposit drops to 20%.",
  "purpose": "explanation"
}
```

Ask a business question:

```json
{
  "type": "message",
  "expected_version": 5,
  "claim_token": "<from claim_turn>",
  "message": "Can you deliver in two drops if the second arrives before the 24th?",
  "purpose": "question"
}
```

Accept the counterparty's exact offer:

```json
{ "type": "accept", "expected_version": 6, "claim_token": "<from claim_turn>", "offer_id": "<current counterparty offer id>" }
```

Escalate to your human (then explain what you need decided in your private chat with the user):

```json
{ "type": "request_human_review", "expected_version": 6, "claim_token": "<from claim_turn>" }
```

Act on pending "Negotiate more" guidance (add its ID; never quote it publicly):

```json
{
  "type": "counter",
  "expected_version": 7,
  "claim_token": "<from claim_turn>",
  "guidance_id": "<pending_guidance_id>",
  "terms": { "unit_price": 7700, "quantity": 80, "delivery_date": "2026-10-24", "deposit_percent": 25 }
}
```

## Error codes

| Status | Meaning | Response |
| --- | --- | --- |
| 401 | Credential invalid, expired or revoked | Stop. Ask the owner to issue a new credential (`/neopact:setup`). |
| 403 | Outside this credential's scopes or role | Stop. Report the missing scope. Never bypass it. |
| 409 | Stale version, lost turn, expired claim, `guidance_required` or `stale_guidance` | Refresh context and decide again. |
| 422 | Payload failed validation | Read the details and correct the shape without loosening limits. |
| Timeout | Outcome unknown | Retry the identical payload and idempotency key, or inspect state. |

Rooms that are ordered or cancelled cannot be reopened. An exhausted offer budget leaves `accept`, `decline` or `request_human_review`.
