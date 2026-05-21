# Internet-Hosted Server and Database Requirements

This document defines the minimum requirements for the internet-hosted application server and database that support the offline-first swap-shop deployment.

## Purpose

The hosted environment must:

- serve the web application securely over the internet
- accept asynchronous sync traffic from field devices
- store the canonical append-only event log
- maintain projections for reads, reports, and conflict review
- tolerate irregular connectivity from phones operating in the field

## Scope

These requirements apply to:

- the public web and API hosting layer
- the PostgreSQL database used as the canonical data store
- the operational controls needed to keep the service reliable and auditable

## Functional Requirements

### Web and API Hosting

- The server must host the web app over HTTPS.
- The server must expose the HTTP API used by the PWA.
- The server must support authenticated access for `user` and `administrator` staff roles (the only two roles defined in `packages/shared/src/domain/types.ts`). Field-day personas like collector and shop operator are device assignments using the `user` role; the administrator role covers the manager workflows.
- The server must expose the sync endpoints used by offline clients:
  - `POST /sync/push`
  - `GET /sync/pull`
  - `GET /sync/status`
  - manager-only conflict and audit endpoints
- The server must remain the canonical authority for accepted events, conflict records, and projection freshness state.

### Event Handling

- The server must append accepted events to the event log and must not mutate or delete historical events.
- The server must treat `eventId` as idempotent so retried client submissions do not create duplicates.
- The server must return deterministic per-event acknowledgements for sync push requests.
- The server must preserve actor, device, timestamp, and schema metadata on all accepted events.

### Read Models and Reporting

- The server must maintain projections for people, balances, inventory, reports, and sync freshness.
- The server must refresh projections after accepted event writes according to the current architecture.
- The server must provide role-restricted reporting and audit endpoints for managers.

## Non-Functional Requirements

### Availability

- The hosted service should be reachable whenever field teams have signal, but field workflows must not depend on constant uptime.
- Temporary service unavailability must not cause client data loss because devices queue events locally until sync succeeds.
- Planned maintenance should avoid trading hours where possible.

### Performance

- The server should respond quickly enough that manual sync remains practical on mobile data connections.
- The server should handle bursty sync traffic at the start and end of field days when multiple devices reconnect.
- Database writes must remain fast enough to keep append-only event processing and projection refreshes within acceptable operator wait times.

### Security

- All public traffic must use HTTPS with a valid TLS certificate.
- Authentication secrets must be stored outside source control.
- Production credentials must not be shared across environments.
- The database must not be exposed directly to the public internet unless tightly restricted and justified.
- Access to manager-only endpoints must be enforced server-side.
- Backups and database snapshots must be protected with the same level of access control as production data.

### Integrity and Auditability

- The database must preserve the append-only event log indefinitely, subject to an explicit future archival policy.
- The hosted environment must support audit investigation of accepted events, rejected events, conflicts, and conflict resolutions.
- Server time must be stable and correctly configured because event ordering, reporting windows, and sync diagnostics depend on timestamps.

## Application Server Requirements

### Runtime

- Run the Node.js API in a production process manager or container runtime.
- Use Node.js `>=22.18.0` (matches `.nvmrc` and `package.json` engines) and npm `>=11.10.0`.
- Provide environment configuration for at least:
  - `DATABASE_URL`
  - `AUTH_SECRET`
  - `AUTH_TOKEN_TTL_SECONDS`
  - `API_PORT`
  - `API_ERROR_LOG_PATH` (optional, default `/var/log/swapshop-api/app-error.log`)
  - `API_ERROR_LOG_MAX_BYTES` (optional, default 5 MiB; the file is truncated when it exceeds this size on the next write)
- Ensure the directory holding the error log is writable by the API process user.
- Support deployment of the web client assets and the API as a coherent release.

### Reverse Proxy and Network

- Place the API behind a reverse proxy or managed ingress that terminates TLS.
- Support HTTP request sizes large enough for batched sync payloads.
- Apply sensible request timeouts that allow mobile clients to complete sync without hanging indefinitely.
- Enable compression for web assets where appropriate.

### Operations

- Support rolling restarts or controlled restarts with minimal downtime.
- Capture structured application logs for login, sync, conflict, and server-error paths.
- Keep server and dependency patching within a documented maintenance process.

## Database Requirements

### Engine

- Use PostgreSQL as the production database engine.
- Use PostgreSQL `>=13` (required for `gen_random_uuid()` used by the schema, and for the JSONB, indexes, transactions, and materialized views relied on by projections).

### Data Model Support

- Support the canonical event table and related projection structures defined by the application schema and migrations.
- Support Prisma-managed schema migrations.
- Support indexes needed for event replay, idempotency, projection queries, and reporting.

### Durability

- Use persistent storage suitable for production workloads.
- Enable automated backups.
- Test database restore procedures before pilot go-live and at regular intervals afterwards.
- Keep backup retention long enough to recover from operator error, failed deployment, or infrastructure loss.

### Isolation and Access

- Use a dedicated production database instance or service, not a shared developer database.
- Restrict database access to the application and authorized administrators.
- Rotate database credentials when staff or infrastructure access changes.

## Backup and Recovery Requirements

- Take automated daily backups at minimum.
- Keep point-in-time recovery or equivalent where the hosting platform supports it.
- Document the restore process and the person responsible for running it.
- Verify that backups can restore both the event log and projection-supporting tables.
- Run restore drills before production launch and after major infrastructure changes.
- Use `docs/operations/backup_and_recovery_runbook.md` as the operational restore procedure and incident-response reference.

## Monitoring and Alerting Requirements

- Monitor server uptime and HTTPS certificate validity.
- Monitor application error rates.
- Monitor database availability, storage growth, and backup success.
- Monitor sync health signals where possible, such as repeated push failures or projection freshness lag.
- Send alerts to a named maintainer, not an unowned mailbox or channel.

## Minimum Production Sizing

For an initial pilot, the hosted environment should provide at least:

- 1 small production-grade Linux VM or equivalent managed runtime for the web/API layer
- 1 managed PostgreSQL instance or dedicated PostgreSQL VM with persistent storage
- regular automated backups
- enough CPU, memory, and disk to absorb end-of-day sync bursts, projection refreshes, and retained event history

Exact sizing should be reviewed after pilot measurements, but the environment must favor reliability and recoverability over extreme cost minimization.

## Deployment and Change Management Requirements

- All schema changes must go through versioned migrations.
- Application and schema changes must be deployed in a controlled sequence.
- Production deployments should include a rollback plan.
- Production changes should be logged with date, operator, and release identifier.
- Use `docs/operations/deployment_and_launch_runbook.md` and `docs/operations/go_live_checklist.md` for deployment execution and release sign-off.

## Out of Scope

This document does not require:

- continuous field connectivity
- peer-to-peer sync between phones
- a field-hosted local server
- tablet-based transactional writes

Those concerns are handled by the offline-first client design and the field deployment model.

## Related Documents

- `docs/architecture/sync_approach.md`
- `docs/architecture/field_deployment.md`
- `docs/architecture/decisions/0004-field-deployment-topology-for-low-connectivity-sites.md`
- `docs/prisma.md`
- `docs/api.md`
