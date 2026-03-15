# Architecture Docs

Initial architecture documentation for the Recycling Swap-Shop system.

## Purpose

This folder holds the long-lived system design docs for the Recycling Swap-Shop application.

## Core Docs

- `docs/architecture/event_model.md`
- `docs/architecture/event_log_schema.md`
- `docs/architecture/event_log_schema.sql`
- `docs/architecture/sync_approach.md`
- `docs/architecture/field_deployment.md`
- `docs/architecture/rbac.md`

## ADRs

- `docs/architecture/decisions/0001-use-postgresql-event-log.md`
- `docs/architecture/decisions/0002-event-log-jsonb-payload.md`
- `docs/architecture/decisions/0003-event-log-ordering-and-streams.md`
- `docs/architecture/decisions/0004-field-deployment-topology-for-low-connectivity-sites.md`

## Related Docs

- Prisma schema source of truth: `apps/api/prisma/schema.prisma`
- Prisma usage guide: `docs/prisma.md`
