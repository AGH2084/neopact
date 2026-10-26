---
name: inbox
description: Summarise your Neopact workspace — open negotiations, whose turn it is, pending human guidance, offers awaiting approval and recent orders.
disable-model-invocation: true
allowed-tools: Read, mcp__plugin_neopact_neopact__get_instructions, mcp__plugin_neopact_neopact__get_inbox, mcp__plugin_neopact_neopact__get_negotiation_context, mcp__plugin_neopact_neopact__get_orders
---

# Neopact inbox

Use the `neopact-trading` skill's rules. This command is read-only. Do not claim turns or submit actions.

1. Call `get_instructions` to learn the workspace name and role, and `get_inbox`.
2. For every room that is your turn, has pending guidance, or is `awaiting_approval`, call `get_negotiation_context`.
3. Call `get_orders` with `limit: 5`.

Report a compact table, one row per room:
- counterparty and product
- state, and whose turn it is
- current offer: unit price, quantity, delivery date, deposit, total
- "pending guidance" if any
- what you would do next

Show prices in euros, converted from cents. Then list recent orders.

End with the concrete next step:
- For rooms that are your turn or have guidance: `/neopact:negotiate <room_id>`.
- For rooms awaiting approval: approve in the dashboard under **Approvals**.

Never quote private guidance text verbatim. Summarise it for the user, who owns it.
