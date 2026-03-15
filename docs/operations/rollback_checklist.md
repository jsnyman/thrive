# Rollback Checklist

Use this checklist if the deployed release must be reversed or recovered.

## Rollback Trigger

- Release identifier:
- Trigger time:
- Triggered by:
- Reason:

## Immediate Containment

- Stop further rollout activity
- Record the last known good release
- Record the latest good backup or PITR target
- Confirm whether field devices currently hold unsynced events
- Notify the named maintainer and manager on duty

## Rollback or Recovery Order

- Decide whether rollback is application-only or requires database recovery
- If database recovery is needed, use `docs/operations/backup_and_recovery_runbook.md`
- Restore or redeploy the last known good API release
- Restore or redeploy the last known good web release
- Repoint runtime configuration if needed
- Refresh projections if required after database recovery

## Validation After Rollback

- Web app loads
- `POST /auth/login` works
- `GET /sync/status` works
- `GET /people` works
- `GET /inventory/status-summary` works
- One manager report endpoint works
- First sync retry works on collector phone
- First sync retry works on shop phone

## Communication and Logging

- Manager on duty informed of rollback result
- Field staff told whether to resume sync or remain offline
- Rollback result recorded in release log
- Follow-up actions assigned

## Closure

- Rollback completed at:
- Operator:
- Final status:
- Outstanding risks:
