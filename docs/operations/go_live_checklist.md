# Go-Live Checklist

Use this checklist during the pilot deployment window.

## Release Details

- Release identifier:
- Environment:
- Operator:
- Start time:

## Pre-Deploy Checks

- Latest backup verified
- Backup identifier recorded
- Rollback owner identified
- Last known good release recorded
- Production hostname resolves correctly
- TLS certificate valid
- Staff accounts verified
- Field devices assigned
- Training completed
- Field-test findings reviewed

## Deployment Steps

- Production migration applied
- API release deployed
- Web release deployed
- Runtime restarted or rolled successfully
- Release identifier recorded in deployment log

## Validation Checks

- Web app loads over HTTPS
- `POST /auth/login` works
- `GET /sync/status` works
- `GET /people` works
- `GET /inventory/status-summary` works
- One manager report endpoint works
- One reconciliation or audit endpoint works
- Person responses are masked by default
- Collector phone first login works
- Shop phone first login works
- First sync on collector phone works
- First sync on shop phone works
- Tablet catalog opens

## Sign-Off

- Release operator sign-off:
- Manager on duty sign-off:
- Named maintainer sign-off:
- Go-live result (`Go` / `No-Go`):
- Notes:
