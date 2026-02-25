-- Event log schema aligned with Prisma (apps/api/prisma/schema.prisma)
-- Payload shapes are defined in packages/shared/src/domain/events.ts

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

create table event (
  event_id uuid primary key,
  event_type event_type not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_user_id uuid not null,
  device_id text not null,
  location_text text,
  schema_version integer not null,
  correlation_id text,
  causation_id text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);

create index event_event_type_idx on event (event_type);
create index event_occurred_at_idx on event (occurred_at);
create index event_actor_user_idx on event (actor_user_id);
create index event_payload_gin_idx on event using gin (payload);

-- Optional targeted payload indexes (enable based on query patterns)
-- create index event_payload_person_idx on event ((payload ->> 'personId'));
-- create index event_payload_batch_idx on event ((payload ->> 'inventoryBatchId'));

-- Non-admin application role (replace CHANGE_ME)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'recycling_app') then
    create role recycling_app login password 'CHANGE_ME';
  end if;
end$$;

grant usage on schema public to recycling_app;
grant select, insert on all tables in schema public to recycling_app;
grant usage, select on all sequences in schema public to recycling_app;
alter default privileges in schema public grant select, insert on tables to recycling_app;
alter default privileges in schema public grant usage, select on sequences to recycling_app;
