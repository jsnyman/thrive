# Shop Operator Training Guide

Use this guide to train staff who record sales and routine stock movement.

## Role Summary

Shop operators are responsible for:

- finding people and checking current visible balances
- recording points-only sales
- moving stock between storage and shop when permitted by the workflow
- requesting adjustments when stock or points appear incorrect

Shop operators do not:

- record material intake
- create or update items
- record procurement or expenses
- apply points adjustments
- apply inventory adjustments
- resolve conflicts or view manager reports

## Device and Login

- Use only the shop phone.
- Log in with a staff account assigned to the shop phone. ("Shop operator" is a device persona — the underlying RBAC role is `user`, the same role used by the collector phone. Both personas share the same permissions; the difference is which device the account is set up on.)
- Confirm the latest items, prices, and inventory state are visible before departure.
- If signal is available before opening, run `Sync Now`.

## Core Workflow

### 1. Check the Person and Balance

- Search for the person before starting the sale.
- Use the balance shown on the shop phone as the current allowed spending balance.
- Do not assume the customer's intake from the collector phone is already available.

### 2. Record the Sale

- Add the correct items and quantities.
- Confirm the points total before submitting.
- If the balance is not enough, stop and explain the reason.
- Submit the sale once and wait for confirmation.

### 3. Handle Same-Day Points Correctly

- If the customer earned points earlier the same day, check whether both phones synced successfully.
- If those points are not visible on the shop phone, do not complete the sale.
- Ask the manager or collector to sync in the correct order when signal becomes available:
  - collector phone first
  - shop phone second

## Practice Scenarios

Run each scenario during training:

1. Complete a normal sale for a person with enough visible points.
2. Correctly block a sale when the balance is too low.
3. Explain why same-day earned points are not yet spendable before sync.
4. Record a permitted stock move between storage and shop.

## Common Mistakes to Prevent

- using a verbal promise instead of the visible balance on the device
- selling items when same-day points have not synced
- choosing the wrong quantity during checkout
- trying to fix stock or points by re-entering a different transaction

## If Something Goes Wrong

- If the sale is not yet submitted, correct it before saving.
- If the wrong sale was submitted, stop and escalate to a manager.
- If the app reports insufficient points or stock, do not bypass the warning.
- If sync fails, keep the phone powered on and continue offline according to procedure.

## Competency Check

The shop operator passes training when they can:

- complete a valid sale without assistance
- stop an invalid sale when the visible balance is insufficient
- explain the sync dependency for same-day points
- escalate stock or points issues without inventing workarounds

## Related Documents

- `docs/operations/field_staff_checklist.md`
- `docs/architecture/field_deployment.md`
- `docs/architecture/rbac.md`
