# Deployment and Launch Runbook

Use this runbook to execute a real deployment of the Recycling Swap-Shop system with concrete commands.

This runbook assumes:

- Ubuntu host
- NGINX + systemd runtime
- PostgreSQL local to the host
- app source deployed from this repository

Use together with:

- `docs/operations/go_live_checklist.md`
- `docs/operations/rollback_checklist.md`
- `docs/operations/backup_and_recovery_runbook.md`
- `docs/operations/manager_pilot_readiness_checklist.md`
- `docs/operations/field_test_plan.md`

## Roles

| Role             | Responsibility                                                           |
| ---------------- | ------------------------------------------------------------------------ |
| Release operator | Executes commands below and records release results                      |
| Named maintainer | Approves production changes, rollback decisions, and recovery escalation |
| Manager on duty  | Confirms pilot readiness and field handover                              |

## Release Inputs (record before starting)

- release identifier (`<tag-or-commit>`)
- operator name
- deployment date/time
- target domain (`<domain>`)
- web URL (`https://<domain>`)
- API URL (`https://<domain>/api`)
- database name/user
- last known good release identifier
- latest backup/snapshot identifier

## 0) Pre-Deploy Safety Checks

Run these from your local machine or bastion:

```bash
# Confirm DNS and HTTPS endpoint are reachable
nslookup <domain>
curl -I https://<domain>

# Confirm SSH access to server
ssh <admin-user>@<server-ip-or-domain> "hostname && uname -a"
```

On server, confirm rollback inputs exist and health is green:

```bash
sudo systemctl status nginx --no-pager
sudo systemctl status recycling-api.service --no-pager || true
```

If backup checks are scripted in your environment, run them now and record the snapshot ID before continuing.

## 1) First-Time Server Bootstrap (new host)

Use this once per fresh server. It installs OS/runtime dependencies, configures NGINX, systemd, PostgreSQL, Prisma migration deploy, projections, optional seed data, and TLS certificate.

```bash
ssh <admin-user>@<server-ip-or-domain>
cd /tmp
git clone <repo-url> recycling-deploy
cd recycling-deploy
sudo bash deploy/bootstrap-ubuntu.sh
```

During prompts, provide:

- domain (`<domain>`)
- repo URL (`<repo-url>`)
- branch (`main` unless approved otherwise)
- app dir (`/opt/recycling-swap-shop`)
- DB name/user/password
- `AUTH_SECRET`
- whether to seed staff (`yes` for first pilot setup only)

The systemd unit also reads optional `API_ERROR_LOG_PATH` (default `/var/log/swapshop-api/app-error.log`) and `API_ERROR_LOG_MAX_BYTES` (default `5242880`). Override these via the service's `Environment=` lines if you need a custom location or rotation size.

After completion:

```bash
sudo systemctl status recycling-api.service --no-pager
sudo systemctl status nginx --no-pager
curl -I https://<domain>
curl -sS https://<domain>/api/sync/status
```

## 2) Standard Release Deploy (existing host)

Run for each release on an already bootstrapped host.

```bash
ssh <admin-user>@<server-ip-or-domain>
sudo su - recycling -s /bin/bash
cd /opt/recycling-swap-shop
```

### 2.1 Pull release

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git rev-parse --short HEAD
```

If deploying a specific tag:

```bash
git fetch --tags
git checkout <tag-or-commit>
git rev-parse --short HEAD
```

### 2.2 Install dependencies and build

```bash
npm ci
npm run prisma:generate
npm run build:web
npm run build:api
```

### 2.3 Apply schema and projection updates

```bash
npm run prisma:migrate:deploy
npm run projections:install
```

### 2.4 Restart API service

```bash
exit  # back to admin user if needed
sudo systemctl restart recycling-api.service
sudo systemctl status recycling-api.service --no-pager
```

## 3) Immediate Technical Validation

Run these checks right after deploy:

```bash
# Web
curl -I https://<domain>

# API liveness / sync
curl -sS https://<domain>/api/sync/status
```

Optional authenticated checks (replace token):

```bash
TOKEN="<bearer-token>"
curl -sS -H "Authorization: Bearer $TOKEN" https://<domain>/api/people
curl -sS -H "Authorization: Bearer $TOKEN" https://<domain>/api/inventory/status-summary
```

Service and logs:

```bash
sudo journalctl -u recycling-api.service -n 100 --no-pager
sudo nginx -t
```

Minimum acceptance criteria:

- web loads over HTTPS
- `GET /api/sync/status` succeeds
- login works from client UI (`POST /api/auth/login`)
- people and inventory endpoints return successful responses with valid auth
- no startup/runtime error loop in `recycling-api.service`

## 4) Pilot Cutover Validation (real devices)

Execute in order:

1. collector phone login and first sync
2. shop phone login and first sync
3. tablet catalog opens (display only)
4. manager report/reconciliation access confirmed

Restate operating rules to staff:

- same-day points require collector sync first, then shop sync
- tablet is display-only
- do not clear browser data when sync fails; escalate first

## 5) Rollback Trigger and Quick Actions

If severe regression is confirmed (auth failure, sync failure, broken projections):

```bash
ssh <admin-user>@<server-ip-or-domain>
sudo su - recycling -s /bin/bash
cd /opt/recycling-swap-shop
git log --oneline -n 5
git checkout <last-known-good-tag-or-commit>
npm ci
npm run prisma:generate
npm run build:web
npm run build:api
exit
sudo systemctl restart recycling-api.service
sudo systemctl status recycling-api.service --no-pager
```

Then follow full process in `docs/operations/rollback_checklist.md`.

## 6) Day-One Monitoring Commands

```bash
# API logs (live)
sudo journalctl -u recycling-api.service -f

# Application error sink (request-handler failures and uncaught/unhandled fatals)
sudo tail -f /var/log/swapshop-api/app-error.log

# NGINX logs
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log

# Service status snapshot
sudo systemctl status recycling-api.service --no-pager
sudo systemctl status nginx --no-pager
```

Watch for:

- repeated sync retries/failures
- auth/login failures
- projection freshness lag
- reconciliation anomalies
- unexpected event rejection patterns

## 7) Post-Launch Recording

Record before closing window:

- deployed release identifier (`git rev-parse --short HEAD`)
- start/end timestamps
- migration result (`prisma:migrate:deploy`)
- validation and pilot sign-off result
- incidents/warnings and owners
- rollback decision (if any)

## Related Documents

- `docs/operations/go_live_checklist.md`
- `docs/operations/rollback_checklist.md`
- `docs/operations/backup_and_recovery_runbook.md`
- `docs/operations/hosted_server_requirements.md`
- `docs/operations/manager_pilot_readiness_checklist.md`
- `docs/operations/field_staff_checklist.md`
