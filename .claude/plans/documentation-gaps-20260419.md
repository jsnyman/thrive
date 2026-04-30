# Documentation Gap Review

## Context

You asked for a documentation audit across all docs in the repo (root + `docs/` + `docs/operations/` + `docs/architecture/`), focused on three things only:

1. **Drift vs. code** — docs that contradict the current implementation
2. **Missing topics** — behavior/config/commands that exist but aren't documented
3. **Inter-doc inconsistencies** — two docs disagreeing on the same fact

The audit ran two parallel Explore passes (dev/architecture side and ops/runbooks side), then I verified the high-impact claims against the actual code. Three agent claims were wrong and have been discarded (`/sync/status`, `STAFF_SEED_JSON`, and `recordedAt` are all already documented correctly).

What follows is verified findings only, ranked by impact, with specific file paths and proposed fixes. This is a _fix list_ — no behavior change, doc edits only.

---

## Drift vs. code (highest impact)

### D1. README status is 5+ weeks behind reality

- `README.md:73-78` claims "Phase 4: in progress. Task 1 is complete. Phase 5: not started."
- `docs/project_plan.md:193-228` (Reality Check dated 2026-03-12) shows **Phases 4 and 5 fully Done** (all 14 tasks complete, including reconciliation tooling, security review, backup runbook, field testing pack, training, launch runbook).
- Today is 2026-04-19, so even project_plan.md is 5 weeks old.
- **Fix:** Rewrite the README "Status" section to match `docs/project_plan.md` Reality Check, refresh the baseline date, and either drop the per-phase narrative or trim it to one line per phase.

### D2. AGENTS.md says NestJS; code is plain Node http.createServer

- `AGENTS.md:18` lists "Backend API: Node.js + NestJS"
- `README.md:40` and `CLAUDE.md:16` correctly note NestJS migration is planned but not started
- `apps/api/src/http/server.ts:2` uses `node:http` `createServer` directly
- **Fix:** Change `AGENTS.md:18` to "Backend API: Node.js + TypeScript HTTP server (NestJS migration planned, not started)" to stop misleading agents into reaching for NestJS conventions.

### D3. CLAUDE.md rounding wording is loose

- `CLAUDE.md:7` says "rounded down to 0.1"
- Reality (per `packages/shared/src/domain/points.ts` and `docs/architecture/event_model.md:91-92`): only **intake line points** are floored to the nearest 0.1; other point values are normalized to one decimal place but not floored.
- **Fix:** Reword the line in CLAUDE.md to match: "1 point = 1 rand; intake line points are floored to the nearest 0.1, all other point values are normalized to one decimal place."

---

## Missing topics

### M1. Three undocumented HTTP endpoints

Confirmed in `apps/api/src/http/server.ts`, missing from `docs/api.md`:

- `GET /adjustments/requests` (server.ts:3379) — pending adjustment requests list
- `GET /users` (server.ts:3394) — list staff users
- `POST /users` (server.ts:3399) — create staff user
- `PATCH /users/:userId` (server.ts:3404) — update staff user

These are administrator-only and were added as part of Phase 5 Task 3. **Fix:** Add a "Users" section and an "Adjustments" section to `docs/api.md` with request/response shapes and required permissions.

### M2. Centralized API error logging is undocumented

- Code: `apps/api/src/http/error-logger.ts` + `apps/api/src/http/config.ts:42-50`
- Two new env vars: `API_ERROR_LOG_PATH` (default `/var/log/swapshop-api/app-error.log`), `API_ERROR_LOG_MAX_BYTES` (default 5 MiB)
- Current doc coverage: only `CLAUDE.md` mentions it (because I just wrote it). Missing from:
  - `docs/api.md:9-12` "Required environment variables" list
  - `docs/operations/deployment_and_launch_runbook.md` (only nginx error log is mentioned at line 222)
  - `docs/operations/hosted_server_requirements.md` env-var table
  - `docs/operations/backup_and_recovery_runbook.md` (no mention of the file's location, rotation/truncation behavior, or what to do if it fills)
- **Fix:** Add these env vars to api.md's env list, add a one-line incident-time check (`tail -f /var/log/swapshop-api/app-error.log`) to the deployment runbook monitoring section, and a one-line note in the recovery runbook about whether the log directory is in scope for backups.

### M3. Hosted-server requirements miss runtime versions

- `.nvmrc` pins Node `22.18.0`; `package.json` engines pins `npm@11.10.0`
- `docs/operations/hosted_server_requirements.md` does not specify a Node minimum or a PostgreSQL version
- Code uses Prisma materialized views and `gen_random_uuid()` (Postgres 13+) — should be specified
- **Fix:** Add a one-line "Node ≥22.18.0, PostgreSQL ≥13" entry to the hosted-server requirements.

### M4. Coverage thresholds are mentioned but not specified

- `README.md:75` claims "enforced thresholds for web/api/shared configs"
- Actual values live in `apps/api/jest.config.cjs` and the two `vitest.config.ts` files
- Nothing in any doc tells you what they are
- **Fix:** Either drop the claim or add the actual numbers (lower priority — users can `grep coverageThreshold`).

---

## Inter-doc inconsistencies

### I1. Training docs use role names that don't exist in code

- `packages/shared/src/domain/types.ts:12` — `StaffRole = "user" | "administrator"` (only two roles)
- `docs/architecture/field_deployment.md:16,26` correctly uses "Typical role: `user`" for both intake and sales phones
- `docs/operations/training_collector.md:26` says "Log in with a collector account"
- `docs/operations/training_shop_operator.md` uses "shop operator account"
- These are _device personas_, not RBAC roles — but the language reads as if they were technical role names
- **Fix:** Add one sentence to each training doc clarifying that "collector" and "shop operator" are device assignments; both use the `user` RBAC role. Or rename to "the staff account assigned to the collector phone."

### I2. RBAC matrix uses natural-language actions; code uses dotted codes

- `docs/architecture/rbac.md:14-36` matrix rows say things like "Manage users and roles", "Move stock between storage and shop"
- `apps/api/src/auth/permissions.ts:4-36` uses dotted codes: `users.manage`, `inventory.move`, `audit.view`, `reports.view`, etc.
- A developer wiring a new endpoint can't easily map between the two
- **Fix:** Add a second column to the rbac.md matrix listing the dotted permission code, or a small "Permission codes" table at the bottom mapping prose → code.

### I3. Both README and project_plan.md baselines are stale

- `README.md:70`: "Baseline date: March 10, 2026"
- `docs/project_plan.md:193`: "Reality Check (`2026-03-12`)"
- Today: 2026-04-19 (≈5 weeks since either snapshot)
- They disagree about Phase 4/5 status (D1 above)
- **Fix:** Pick one canonical status doc (project_plan.md is more granular) and have README link to it instead of duplicating phase claims.

---

## Findings investigated and discarded (false positives)

For transparency on what was checked but found correct:

- `event_model.md:21` _does_ include `recordedAt` in the envelope table.
- `docs/api.md:778, 811-813` _does_ document `GET /sync/status`.
- `docs/api.md:952-962` _does_ document `STAFF_SEED_JSON` with a usage example.

---

## Critical files to edit (if you approve fixes)

| File                                                                 | Sections to touch                                                | Findings |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| `README.md`                                                          | "Status" (lines 68-78), "Baseline date"                          | D1, I3   |
| `AGENTS.md`                                                          | line 18 (Backend API line)                                       | D2       |
| `CLAUDE.md`                                                          | line 7 (rounding wording)                                        | D3       |
| `docs/api.md`                                                        | env vars list (lines 9-12); add "Users" + "Adjustments" sections | M1, M2   |
| `docs/architecture/rbac.md`                                          | matrix (lines 14-36)                                             | I2       |
| `docs/operations/deployment_and_launch_runbook.md`                   | env-var section + monitoring section                             | M2       |
| `docs/operations/hosted_server_requirements.md`                      | env-var table + runtime versions                                 | M2, M3   |
| `docs/operations/backup_and_recovery_runbook.md`                     | one-line note on error log scope                                 | M2       |
| `docs/operations/training_collector.md`, `training_shop_operator.md` | role-clarification sentence                                      | I1       |
| `docs/project_plan.md`                                               | refresh "Reality Check" date                                     | I3       |

## Verification

After edits:

1. Re-grep for stale claims: `rg "Phase [45].*not started|Baseline date: March 10|NestJS" -g '!CLAUDE.md'` should return zero hits where the claim contradicts code.
2. Re-grep for env var coverage: `rg "API_ERROR_LOG_PATH"` should hit at least api.md, deployment runbook, hosted-server requirements, CLAUDE.md.
3. Cross-check that every endpoint in `apps/api/src/http/server.ts` route-matching block has a corresponding section in `docs/api.md` (manual scan).
4. Confirm `docs/architecture/rbac.md` matrix lists every action in `apps/api/src/auth/permissions.ts:4-36`.
