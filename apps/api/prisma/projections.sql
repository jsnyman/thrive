create table if not exists projection_freshness (
  key text primary key,
  refreshed_at timestamptz not null default now(),
  cursor_recorded_at timestamptz,
  cursor_event_id uuid
);

create materialized view if not exists mv_people as
select
  p.id,
  p.name,
  p.surname,
  p.id_number as "idNumber",
  p.phone,
  p.address,
  p.notes,
  p.created_at as "createdAt"
from person p;

create unique index if not exists mv_people_id_idx on mv_people (id);

create materialized view if not exists mv_points_ledger_entries as
with intake as (
  select
    e.event_id as id,
    e.payload ->> 'personId' as person_id,
    (e.payload ->> 'totalPoints')::integer as delta_points,
    e.occurred_at as occurred_at,
    'intake.recorded'::text as source_event_type,
    e.event_id as source_event_id
  from event e
  where e.event_type = 'intake.recorded'
),
sale as (
  select
    e.event_id as id,
    e.payload ->> 'personId' as person_id,
    ((e.payload ->> 'totalPoints')::integer * -1) as delta_points,
    e.occurred_at as occurred_at,
    'sale.recorded'::text as source_event_type,
    e.event_id as source_event_id
  from event e
  where e.event_type = 'sale.recorded'
),
points_adjustment as (
  select
    e.event_id as id,
    e.payload ->> 'personId' as person_id,
    (e.payload ->> 'deltaPoints')::integer as delta_points,
    e.occurred_at as occurred_at,
    'points.adjustment_applied'::text as source_event_type,
    coalesce(e.payload ->> 'requestEventId', e.event_id) as source_event_id
  from event e
  where e.event_type = 'points.adjustment_applied'
)
select *
from intake
union all
select *
from sale
union all
select *
from points_adjustment;

create index if not exists mv_points_ledger_entries_person_idx
  on mv_points_ledger_entries (person_id, occurred_at desc);

create materialized view if not exists mv_points_balances as
select
  l.person_id,
  coalesce(sum(l.delta_points), 0)::integer as balance_points
from mv_points_ledger_entries l
group by l.person_id;

create unique index if not exists mv_points_balances_person_idx on mv_points_balances (person_id);

create materialized view if not exists mv_inventory_status_summary as
with status_changes as (
  select
    e.payload ->> 'inventoryBatchId' as inventory_batch_id,
    e.payload ->> 'toStatus' as status,
    (e.payload ->> 'quantity')::integer as quantity
  from event e
  where e.event_type = 'inventory.status_changed'
)
select
  status,
  coalesce(sum(quantity), 0)::integer as total_quantity
from status_changes
group by status;

create unique index if not exists mv_inventory_status_summary_status_idx
  on mv_inventory_status_summary (status);
