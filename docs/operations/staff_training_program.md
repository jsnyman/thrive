# Staff Training Program

Use this guide to prepare collectors, shop operators, and managers before pilot operation.

## Audience

- Collector
- Shop operator
- Manager

## Training Goals

- Ensure each role can complete its own workflows without crossing permission boundaries.
- Reinforce the two-phone operating model for low-connectivity field days.
- Train staff to treat points, stock, and sync outcomes as auditable records.
- Reduce field errors before pilot deployment.

## Required Materials

- `1` collector phone with a collector account
- `1` shop phone with a shop operator account
- `1` tablet with the catalog cached offline
- Test people, materials, items, and inventory loaded in advance
- Printed or digital copies of the role guides in this folder

## Training Format

### Session 1: Shared Orientation (`30-45` minutes)

Cover these topics with all staff together:

- device roles:
  - collector phone for registration and intake
  - shop phone for balances, sales, and stock movement
  - tablet for display only
- login and passcode handling
- same-day points rule:
  - points earned on the collector phone are not spendable until both phones sync successfully
- offline-first behavior:
  - staff can continue working when sync fails
  - staff must not clear browser data or reinstall the app during a field day
- audit rule:
  - points, stock, procurement, and expenses are recorded as permanent events

### Session 2: Role Practice (`30-45` minutes per role)

Split staff by role and run the role-specific guide:

- collector: `docs/operations/training_collector.md`
- shop operator: `docs/operations/training_shop_operator.md`
- manager: `docs/operations/training_manager.md`

### Session 3: Field Simulation (`30` minutes)

Run one end-to-end practice flow:

1. Collector registers a person and records intake.
2. Shop operator attempts to spend newly earned points before sync and correctly blocks the sale.
3. Manager coordinates collector sync first and shop sync second.
4. Shop operator retries the sale after sync.
5. Manager reviews reports or reconciliation indicators at the end of the exercise.

## Readiness Criteria

A staff member is ready for pilot use when they can:

- log in and navigate only the screens relevant to their role
- explain what their device is allowed to do
- complete their role's core transaction flow without assistance
- explain what to do when connectivity is unavailable
- state the same-day points rule correctly

## Trainer Checklist

- Confirm each trainee used the correct role account.
- Confirm each trainee completed at least one successful practice transaction.
- Confirm each trainee handled one offline or sync-delay scenario verbally or in practice.
- Confirm each trainee knows who to escalate to when something is blocked.
- Record any repeated confusion before pilot sign-off.

## Sign-Off Record

Record the following for each trainee:

- name
- role
- training date
- trainer name
- passed practice scenarios
- follow-up actions, if any

## Related Documents

- `docs/operations/field_staff_checklist.md`
- `docs/operations/manager_pilot_readiness_checklist.md`
- `docs/architecture/field_deployment.md`
- `docs/architecture/rbac.md`
