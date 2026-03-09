# Event Log Schema (JSONB)

This document describes the PostgreSQL event log schema stored in `docs/architecture/event_log_schema.sql` and implemented via Prisma in `apps/api/prisma/schema.prisma`.

The event payload shapes are defined in `packages/shared/src/domain/events.ts`. Payload fields use camelCase.

Principles

- Append-only log.
- Envelope fields are typed columns; payload is JSONB for evolution.
- Event types are stored as Postgres enum values matching dotted names (`intake.recorded`, etc.), mapped from Prisma enum via `@map`.

Current table: `event` (singular).
Current columns

- `event_id uuid primary key`
- `event_type event_type not null` (enum)
- `occurred_at timestamptz not null`
- `recorded_at timestamptz default now()`
- `actor_user_id uuid not null`
- `device_id text not null`
- `location_text text`
- `schema_version integer not null`
- `correlation_id text`
- `causation_id text`
- `payload jsonb not null`

Indexing Notes

- `event_payload_gin_idx` supports key existence (`?`) and containment (`@>`) queries.
- Add functional indexes for hot keys (`payload ->> 'personId'`) as needed.

Example Queries

```sql
-- Insert an event
insert into event (
  event_id,
  event_type,
  occurred_at,
  actor_user_id,
  device_id,
  location_text,
  schema_version,
  payload
) values (
  '11111111-1111-4111-8111-111111111111',
  'intake.recorded',
  '2026-02-19T08:15:22Z',
  '00000000-0000-0000-0000-000000000123',
  'device_a7',
  'Village A - Community Hall',
  1,
  '{"personId":"person_456","lines":[{"materialTypeId":"mat_plastic","weightKg":4.2,"pointsPerKg":3,"pointsAwarded":12}],"totalPoints":12}'::jsonb
);

-- Filter by event type
select * from event where event_type = 'sale.recorded' order by occurred_at;

-- Filter by payload value
select * from event where payload @> '{"personId":"person_456"}';

-- Filter by time window
select * from event where occurred_at >= now() - interval '7 days' order by occurred_at;
```
