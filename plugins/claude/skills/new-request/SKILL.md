---
name: new-request
description: Buyer only — turn a plain-language purchasing need into a reviewed Neopact request, then launch it to matching sellers after explicit confirmation.
argument-hint: "<what you need, e.g. 80 stackable polypropylene chairs to Sofia within 14 days, max €7,500>"
disable-model-invocation: true
allowed-tools: Read, mcp__plugin_neopact_neopact__get_instructions, mcp__plugin_neopact_neopact__get_inbox, mcp__plugin_neopact_neopact__search_catalogue
---

# New Neopact purchase request

Need: `$ARGUMENTS`

Follow the `neopact-trading` skill and read `${CLAUDE_PLUGIN_ROOT}/skills/neopact-trading/references/buyer.md`.

1. Call `get_instructions`. If the role is not buyer, or `requests:write` is missing, explain and stop.
2. Call `get_inbox` to check for an existing request or rooms for the same need. Don't create duplicates.
3. Optionally call `search_catalogue` with the destination and material to sanity-check that sellers exist. Mention any obvious mismatch, such as no stock or a destination that isn't served.
4. Draft the `RequestInput` JSON:
   - Compute `latest_delivery` as an absolute ISO date from today's date.
   - Convert money to integer cents.
   - If the user gave no budget, deposit cap or preference, **ask**. Never invent a budget.
5. Show the draft as a readable summary plus the JSON. Wait for explicit confirmation or edits.
6. Call `create_request` once, with an idempotency key like `req-<short-slug>-<yyyymmddhhmm>`. Then call `launch_request` with a different key, like `launch-<request_id>`.
7. Report the request ID, the matched sellers and the reasons for each match. Suggest `/neopact:negotiate all` to start negotiating.
