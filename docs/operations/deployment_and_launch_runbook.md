# Deployment and Launch Runbook

Use this runbook to prepare, deploy, validate, and hand over the pilot launch of the Recycling Swap-Shop system.

This document is the primary operator guide for release execution. It should be used together with:

- `docs/operations/go_live_checklist.md`
- `docs/operations/rollback_checklist.md`
- `docs/operations/backup_and_recovery_runbook.md`
- `docs/operations/manager_pilot_readiness_checklist.md`
- `docs/operations/field_test_plan.md`

## Purpose

The launch process must ensure that:

- the hosted web/API deployment is reachable and correctly configured
- the database schema and runtime version are aligned
- backup and recovery controls are verified before cutover
- the first field devices can log in and sync successfully
- managers can sign off on pilot readiness using a repeatable process

## Roles

| Role             | Responsibility                                                               |
| ---------------- | ---------------------------------------------------------------------------- |
| Release operator | Executes the deployment steps and records the release result                 |
| Named maintainer | Approves production changes, rollback decisions, and recovery escalation     |
| Manager on duty  | Confirms pilot-readiness checks, first-device validation, and field handover |

## Release Inputs

Before deployment, record:

- release identifier or version tag
- operator name
- environment
- deployment date and start time
- target API base URL
- target web URL
- schema or migration version being deployed
- last known good release identifier

## Launch Prerequisites

Before any production cutover:

- hosting environment is ready and reachable
- TLS is valid and the public hostname resolves correctly
- staff accounts are seeded and validated
- automated backups are healthy
- the latest restore drill has been completed and recorded
- field devices are assigned and named
- training for collector, shop operator, and manager roles is complete
- the field test pack has been reviewed and any blocking findings are closed or accepted
- the current rollback owner is identified

Reference documents:

- hosting: `docs/operations/hosted_server_requirements.md`
- recovery: `docs/operations/backup_and_recovery_runbook.md`
- field validation: `docs/operations/field_test_plan.md`
- training: `docs/operations/staff_training_program.md`

## Deployment Sequence

### 1. Pre-Deploy Safety Checks

- Confirm the latest production backup succeeded.
- Confirm the backup identifier or snapshot ID is recorded.
- Confirm rollback inputs are available:
  - last known good release
  - backup or PITR target
  - responsible approver
- Open `docs/operations/go_live_checklist.md` and record the release start.

### 2. Apply Schema Changes

- Apply production migrations in the controlled deployment sequence used by the environment.
- Stop and investigate if any migration fails.
- Do not proceed to application cutover if schema state is uncertain.

### 3. Deploy Web and API Release

- Deploy the API release.
- Deploy the web client assets.
- Restart or roll the runtime in the standard production sequence.
- Record the deployed release identifier.

### 4. Immediate Technical Validation

Validate at minimum:

- public web app loads over HTTPS
- `POST /auth/login`
- `GET /sync/status`
- `GET /people`
- `GET /inventory/status-summary`
- one manager report endpoint
- one reconciliation or audit endpoint

Also confirm:

- standard person responses still return masked ID and phone values
- manager-only endpoints still enforce access correctly
- sync status and projection freshness look reasonable

### 5. Pilot Cutover Validation

Using real pilot devices:

- log in on collector phone
- log in on shop phone
- confirm tablet catalog opens
- run first sync on collector phone
- run first sync on shop phone
- confirm manager can access reports and reconciliation
- confirm field-day rules are restated to staff:
  - same-day points require collector sync first, then shop sync
  - tablet is display-only
  - do not clear browser data if sync fails

### 6. Manager Sign-Off

The manager on duty must confirm:

- core devices can log in
- first sync works on both phones, or exceptions are explicitly accepted
- tablet is ready for display use
- no blocking issue remains from deployment validation
- field team has the correct day-of-operation documents

## Day-One Monitoring

After go-live, monitor:

- sync failures or repeated retries
- projection freshness lag
- reconciliation issues
- backup success after launch
- login failures
- any rejected events or unexpected balance reports from the field

If a release issue is suspected:

- pause new rollout activity
- decide whether the issue is operationally tolerable for the pilot
- use `docs/operations/rollback_checklist.md` if rollback is needed

## Post-Launch Recording

Record the following before closing the launch window:

- release identifier
- operator
- deployment start and end time
- migration result
- validation result
- manager sign-off result
- incidents or warnings observed
- rollback decision, if any
- follow-up actions and owners

## Handover to Field Operations

Before the first field day after launch:

- provide `docs/operations/field_staff_checklist.md` to staff
- provide `docs/operations/manager_pilot_readiness_checklist.md` to the manager
- confirm `docs/operations/field_test_execution_sheet.md` is ready if a pilot validation day is being run
- confirm the recovery owner is reachable during the pilot window

## Related Documents

- `docs/operations/go_live_checklist.md`
- `docs/operations/rollback_checklist.md`
- `docs/operations/backup_and_recovery_runbook.md`
- `docs/operations/hosted_server_requirements.md`
- `docs/operations/manager_pilot_readiness_checklist.md`
- `docs/operations/field_staff_checklist.md`
