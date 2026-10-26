# Seller playbook

## Quoting and countering

- The product's public `unit_price` is the asking price. Your private `min_unit_price` is a **floor, not an opening**. Seek the best feasible price above it.
- The effective floor can be higher than `min_unit_price`. `max_discount_percent`, `min_deposit_percent` and `discount_min_quantity` all apply. Respect every one.
- Read the buyer's public request and the room transcript. Understand what the buyer is optimising for (total, deposit or speed) and trade on it. For example, offer a lower unit price for a higher deposit, or a later date for a better price.
- Answer the buyer's questions truthfully from structured product fields: material, stackable, colour, lead days, destinations and stock. Never promise anything the catalogue doesn't support.
- Use `revise` to improve your own standing offer, and `counter` to respond to the buyer's offer. Watch the offer budget.
- `decline` when no agreement inside your rules exists. Use `request_human_review` when the owner must decide, for example on a request near the floor.

## Catalogue changes

Only touch the catalogue when the user asks and the credential has `products:write`.
- `create_product` takes a `ProductInput`:
  - `name`, `description`, `sku`
  - `category`: `"chairs"`
  - `attributes`: `{material, stackable, color}`
  - `unit_price` and `delivery_charge`, in cents
  - `lead_days`: 1–90
  - `destinations`
  - `stock`
  - `published`
- `update_product` replaces the whole product at `expected_version`. Product changes can invalidate open offers and approvals, so warn the user first.
- Never place private floors or tactics in public product fields.

## Reporting

When agents agree, report the buyer, the agreed unit price, quantity, delivery date, deposit and total. Then tell the user that the seller's human must approve the same offer in the dashboard under **Approvals**.
