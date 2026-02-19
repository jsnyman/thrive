# Event Log Schema (JSONB)

This document describes the PostgreSQL event log schema stored in `docs/architecture/event_log_schema.sql`.

The event payload shapes are defined in `packages/shared/src/domain/events.ts`. Payload fields use camelCase.

Principles
- The event log is append-only.
- Global ordering is `event_sequence`.
- The envelope fields are typed columns.
- The payload is JSONB for flexible evolution.

Indexing Notes
- `event_log_payload_gin_idx` supports key existence (`?`) and containment (`@>`) queries.
- If you only use containment, consider `jsonb_path_ops` for smaller, faster indexes.
- Add functional indexes for hot keys (`payload ->> 'personId'`) as needed.

Example Queries
```sql
-- Insert an event
insert into event_log (
  event_id,
  event_type,
  occurred_at,
  recorded_at,
  actor_user_id,
  device_id,
  location_text,
  schema_version,
  correlation_id,
  causation_id,
  stream_type,
  stream_id,
  payload
) values (
  '01HZXXTEST0001',
  'intake.recorded',
  '2026-02-19T08:15:22Z',
  null,
  'user_123',
  'device_a7',
  'Village A - Community Hall',
  1,
  'corr_01HZXXTEST',
  null,
  'person',
  'person_456',
  '{"personId":"person_456","lines":[{"materialTypeId":"mat_plastic","weightKg":4.2,"pointsPerKg":3,"pointsAwarded":12.6}],"totalPoints":12.6}'::jsonb
);

-- Global ordered log
select * from event_log order by event_sequence;

-- Filter by event type
select * from event_log where event_type = 'sale.recorded' order by event_sequence;

-- Filter by stream
select * from event_log
where stream_type = 'person' and stream_id = 'person_456'
order by event_sequence;

-- Filter by payload key existence
select * from event_log where payload ? 'inventoryBatchId';

-- Filter by payload value
select * from event_log where payload @> '{"personId":"person_456"}';

-- Filter by nested array content
select * from event_log
where payload @> '{"lines":[{"itemId":"item_789"}]}';

-- Filter by correlation
select * from event_log where correlation_id = 'corr_01HZXXTEST' order by event_sequence;

-- Filter by time window
select * from event_log
where occurred_at >= now() - interval '7 days'
order by event_sequence;
```
