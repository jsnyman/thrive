create table if not exists projection_freshness (
  key text primary key,
  refreshed_at timestamptz not null default now(),
  cursor_recorded_at timestamptz,
  cursor_event_id uuid
);

create or replace function prevent_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'event table is append-only; % is not allowed', tg_op;
end;
$$;

drop trigger if exists event_append_only_guard on event;
create trigger event_append_only_guard
before update or delete on event
for each row
execute function prevent_event_mutation();

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
    e.event_id::text as id,
    e.payload ->> 'personId' as person_id,
    (e.payload ->> 'totalPoints')::numeric(12, 1) as delta_points,
    e.occurred_at as occurred_at,
    'intake.recorded'::text as source_event_type,
    e.event_id::text as source_event_id
  from event e
  where e.event_type = 'intake.recorded'
),
sale as (
  select
    e.event_id::text as id,
    e.payload ->> 'personId' as person_id,
    ((e.payload ->> 'totalPoints')::numeric(12, 1) * -1) as delta_points,
    e.occurred_at as occurred_at,
    'sale.recorded'::text as source_event_type,
    e.event_id::text as source_event_id
  from event e
  where e.event_type = 'sale.recorded'
),
points_adjustment as (
  select
    e.event_id::text as id,
    e.payload ->> 'personId' as person_id,
    (e.payload ->> 'deltaPoints')::numeric(12, 1) as delta_points,
    e.occurred_at as occurred_at,
    'points.adjustment_applied'::text as source_event_type,
    coalesce(e.payload ->> 'requestEventId', e.event_id::text) as source_event_id
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
  coalesce(sum(l.delta_points), 0)::numeric(12, 1) as balance_points
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

create materialized view if not exists mv_materials_collected_daily as
with intake_lines as (
  select
    e.occurred_at::date as day,
    coalesce(nullif(trim(e.location_text), ''), 'Unspecified') as location_text,
    line ->> 'materialTypeId' as material_type_id,
    (line ->> 'weightKg')::numeric(12, 3) as weight_kg,
    (line ->> 'pointsAwarded')::numeric(12, 1) as points_awarded
  from event e
  cross join lateral jsonb_array_elements((e.payload -> 'lines')::jsonb) as line
  where e.event_type = 'intake.recorded'
)
select
  intake.day,
  intake.material_type_id,
  coalesce(mt.name, intake.material_type_id) as material_name,
  intake.location_text,
  coalesce(sum(intake.weight_kg), 0)::numeric(12, 3) as total_weight_kg,
  coalesce(sum(intake.points_awarded), 0)::numeric(12, 1) as total_points
from intake_lines intake
left join material_type mt on mt.id::text = intake.material_type_id
where intake.material_type_id is not null
group by intake.day, intake.material_type_id, coalesce(mt.name, intake.material_type_id), intake.location_text;

create index if not exists mv_materials_collected_daily_day_idx
  on mv_materials_collected_daily (day desc);

create index if not exists mv_materials_collected_daily_material_idx
  on mv_materials_collected_daily (material_type_id);

create index if not exists mv_materials_collected_daily_location_idx
  on mv_materials_collected_daily (location_text);

