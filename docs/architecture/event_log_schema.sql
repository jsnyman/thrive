-- Event log schema (JSONB payload)
-- Source of truth for event payload shape: packages/shared/src/domain/events.ts

create type event_type as enum (
  'person.created',
  'person.profile_updated',
  'material_type.created',
  'material_type.updated',
  'item.created',
  'item.updated',
  'staff_user.created',
  'staff_user.role_changed',
  'intake.recorded',
  'sale.recorded',
  'procurement.recorded',
  'expense.recorded',
  'inventory.status_changed',
  'inventory.adjustment_requested',
  'inventory.adjustment_applied',
  'points.adjustment_requested',
  'points.adjustment_applied',
  'conflict.detected',
  'conflict.resolved'
);

create type stream_type as enum (
  'person',
  'material_type',
  'item',
  'staff_user',
  'intake',
  'sale',
  'procurement',
  'expense',
  'inventory_batch',
  'points',
  'conflict'
);

create table event_log (
  event_id text primary key,
  event_sequence bigint generated always as identity unique,
  event_type event_type not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz,
  actor_user_id text not null,
  device_id text not null,
  location_text text,
  schema_version integer not null default 1 check (schema_version = 1),
  correlation_id text,
  causation_id text,
  stream_type stream_type,
  stream_id text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);

create index event_log_event_type_seq_idx on event_log (event_type, event_sequence);
create index event_log_stream_seq_idx on event_log (stream_type, stream_id, event_sequence);
create index event_log_occurred_at_idx on event_log (occurred_at);
create index event_log_actor_seq_idx on event_log (actor_user_id, event_sequence);
create index event_log_correlation_idx on event_log (correlation_id);
create index event_log_causation_idx on event_log (causation_id);

-- General payload index for containment queries like payload @> '{"personId":"..."}'
create index event_log_payload_gin_idx on event_log using gin (payload);

-- Optional: targeted indexes for common lookups
-- create index event_log_payload_person_idx on event_log ((payload ->> 'personId'));
-- create index event_log_payload_inventory_batch_idx on event_log ((payload ->> 'inventoryBatchId'));
