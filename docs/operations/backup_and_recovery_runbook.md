# Backup and Recovery Runbook

Use this runbook to protect and recover the hosted swap-shop service during pilot and early production operation.

This document defines the operational backup schedule, restore procedure, disaster-response steps, and evidence that must be recorded after any recovery action.

## Purpose

The recovery process must protect:

- the canonical PostgreSQL event log
- projection-supporting tables and materialized views
- the deployed web/API release configuration
- the ability of field devices to resume sync safely after server recovery

This runbook does not replace device-level offline queue protection. Field devices remain responsible for preserving unsynced events locally until sync can resume.

## Recovery Targets

- Recovery point objective:
  - target no more than `24` hours of data exposure from backup alone
  - prefer point-in-time recovery where the host supports it
- Recovery time objective:
  - restore pilot service within the same operating day when feasible
  - otherwise recover before the next planned field day
- Minimum backup coverage:
  - production PostgreSQL data
  - deployment configuration needed to reconnect the API to the restored database
  - release identifier or deployment artifact reference for the currently running version

## Roles and Responsibilities

| Role                               | Responsibility                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Named maintainer                   | Owns backup verification, restore drills, and live recovery execution                                              |
| Manager on duty                    | Records operational impact on field teams and confirms whether phones must remain offline until recovery completes |
| Infrastructure owner or host admin | Provides access to snapshots, database backups, PITR controls, and runtime restart access                          |

## Backup Policy

### Database Backups

- Run automated daily PostgreSQL backups at minimum.
- Enable point-in-time recovery or write-ahead-log retention where the hosting platform supports it.
- Keep retention long enough to recover from:
  - operator error
  - failed deployment
  - infrastructure loss
  - delayed issue discovery after a field day
- Protect backup access with the same or stricter controls than live production access.

### Backup Verification

- Review backup-job success daily or on every active field day.
- Run a restore drill:
  - before pilot go-live
  - after major infrastructure changes
  - at a regular interval chosen by the named maintainer
- Record every drill outcome, including duration and any missing prerequisite.

### Operational Records to Keep

For each backup or restore cycle, record:

- backup date/time
- backup source environment
- backup identifier or snapshot ID
- retention window
- operator or system that created it
- verification result

## Restore Scenarios

### Scenario A: Accidental data loss or corrupted production state

Use when:

- data was deleted or altered unexpectedly
- a deployment introduced invalid schema or runtime behavior
- projections are no longer trustworthy and recovery requires a database restore instead of normal reconciliation

Response:

1. Stop new production writes if possible.
2. Record the incident start time and suspected impact window.
3. Identify the latest safe backup or PITR timestamp.
4. Restore to a separate recovery environment first when practical.
5. Validate:
   - event table present and readable
   - staff login still works
   - people, balances, inventory, and sync status endpoints respond
6. Promote the recovered database only after validation.

### Scenario B: Full host or database instance failure

Use when:

- the VM or managed database is unavailable
- storage is lost
- the environment cannot be recovered in place

Response:

1. Provision replacement infrastructure.
2. Restore the database from the latest viable backup or PITR target.
3. Reapply runtime configuration:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `AUTH_TOKEN_TTL_SECONDS`
   - `API_PORT`
4. Deploy the last known good web/API release.
5. Run post-restore validation.
6. Announce service recovery only after validation completes.

## Restore Procedure

### Preparation

Before any live restore:

- identify the incident type
- identify the last known good timestamp
- identify whether field devices still hold unsynced events
- confirm who has authority to approve cutover
- record the recovery operator and start time

### Database Restore

1. Create a fresh restore target:
   - replacement database instance, or
   - recovery copy in the existing platform
2. Restore from:
   - latest clean snapshot, or
   - point-in-time timestamp before the incident
3. Confirm core tables and views exist.
4. Start the API against the restored database.
5. Refresh projections if needed after restore so read paths reflect the recovered event log.

### Post-Restore Validation

Validate the restored system using the API and operational checks:

- `POST /auth/login`
- `GET /people`
- `GET /inventory/status-summary`
- `GET /sync/status`
- one manager report endpoint
- one reconciliation or audit endpoint

Also confirm:

- event log rows exist and are readable
- projection freshness is consistent with the restored event state
- manager-only endpoints still enforce access correctly
- standard person responses still return masked ID and phone values

### Cutover and Resume

After validation:

1. Point the live API/runtime to the restored database.
2. Restart the API and verify health again.
3. Tell field teams whether they may resume sync.
4. If devices were offline during the outage:
   - keep browser data intact
   - let devices retry sync after service recovery
   - monitor for conflicts or rejected events after recovery

## Field-Day Recovery Guidance

If a server outage happens during a field day:

- do not tell staff to clear browser data
- do not reinstall the app on phones
- continue offline operation only if the workflow does not require server confirmation
- apply the same-day points rule strictly:
  - the shop phone may only trust balances already visible on that phone
- record which devices still hold unsynced events before recovery begins

After the server is restored:

- sync collector phone first
- sync shop phone second
- repeat sync if needed so the shop phone pulls the collector phone's newly accepted events
- log any conflicts, rejected events, or balance surprises in the field findings log

## Recovery Log Template

Record this for every real incident or restore drill:

- Incident or drill ID:
- Date:
- Operator:
- Incident type:
- Recovery start time:
- Recovery end time:
- Backup or snapshot identifier:
- PITR timestamp if used:
- Restored environment:
- Validation checks run:
- Result:
- Outstanding follow-up items:

## Related Documents

- `docs/operations/deployment_and_launch_runbook.md`
- `docs/operations/rollback_checklist.md`
- `docs/operations/hosted_server_requirements.md`
- `docs/operations/host_provider_procurement_checklist.md`
- `docs/operations/manager_pilot_readiness_checklist.md`
- `docs/operations/field_test_findings_log.md`
- `docs/architecture/field_deployment.md`
