# Manager Training Guide

Use this guide to train staff who supervise field operations and handle restricted workflows.

## Role Summary

Managers are responsible for:

- overseeing field readiness and role assignment
- recording procurement and expenses
- creating or updating items when needed
- reviewing reports
- approving or applying points and inventory corrections
- monitoring sync issues, conflicts, and reconciliation findings

Managers are also responsible for enforcing operating discipline:

- each transactional phone keeps a fixed role for the day
- same-day points are spendable only after successful sync
- staff must not clear browser data or reinstall the app during an incident

## Device and Login

- Use a manager account on an approved device.
- Confirm manager-only workflows are visible before pilot use.
- Check that collector and shop accounts exist and are assigned correctly.

## Core Workflow

### 1. Pre-Field Readiness

- Confirm devices are charged and assigned.
- Confirm the collector phone and shop phone have synced.
- Confirm the tablet catalog has been refreshed.
- Brief staff on the same-day points rule and incident procedure.

### 2. During Trading

- Monitor whether staff stay within their role boundaries.
- Coordinate sync attempts when signal becomes available.
- If same-day points need to become spendable, direct collector sync first and shop sync second.
- Record any operational incidents that may need follow-up after the field day.

### 3. Restricted Corrections and Oversight

- Review adjustment requests before applying any correction.
- Use append-only correction workflows rather than trying to rewrite history.
- Review reports for obvious anomalies in points, stock, procurement, or expenses.
- Review sync conflicts or reconciliation issues and resolve them with notes when required.

### 4. Close-Out

- Stop new transactions before end-of-day sync.
- Confirm both phones complete sync, repeating once if necessary.
- Confirm pending work is either synced or clearly logged for follow-up.

## Practice Scenarios

Run each scenario during training:

1. Brief staff on device roles and the same-day points rule.
2. Handle an adjustment request caused by a staff entry mistake.
3. Coordinate a midday sync sequence so newly earned points become visible to the shop.
4. Review one report or reconciliation issue and explain the follow-up action.

## Common Mistakes to Prevent

- allowing devices to switch roles mid-day without control
- telling staff to solve audit problems by deleting data
- approving corrections without recording enough reason detail
- treating the tablet as a transactional device
- assuming a single successful sync on one phone updates the other phone automatically

## Incident Response

- If a device cannot sync, keep it powered on and record the device and user involved.
- If staff entered incorrect data, preserve the audit trail and use the approved correction path.
- If a conflict or reconciliation issue appears, resolve it with clear notes.
- If connectivity is unavailable, defer resolution work that depends on the server but preserve local data.

## Competency Check

The manager passes training when they can:

- explain the field operating model end to end
- direct staff during offline and delayed-sync conditions
- apply or supervise corrections without breaking immutability rules
- use manager-only oversight functions appropriately

## Related Documents

- `docs/operations/manager_pilot_readiness_checklist.md`
- `docs/architecture/field_deployment.md`
- `docs/architecture/rbac.md`
