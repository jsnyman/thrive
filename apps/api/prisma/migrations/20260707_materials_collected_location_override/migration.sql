-- Recreate mv_materials_collected_daily to resolve location via the collection-point
-- model: intake events with a payload.collectionPointId resolve to that collection
-- point's real name; historical intake events without one (predating the
-- collection-point model) resolve to "Heuwelkroon parkie" instead of the raw
-- free-text location_text column. No event payloads are mutated by this migration.
DROP MATERIALIZED VIEW IF EXISTS mv_materials_collected_daily;

CREATE MATERIALIZED VIEW mv_materials_collected_daily AS
WITH intake_lines AS (
  SELECT
    e.occurred_at::date AS day,
    e.payload ->> 'collectionPointId' AS collection_point_id,
    line ->> 'materialTypeId' AS material_type_id,
    (line ->> 'weightKg')::numeric(12, 3) AS weight_kg,
    (line ->> 'pointsAwarded')::numeric(12, 1) AS points_awarded
  FROM event e
  CROSS JOIN LATERAL jsonb_array_elements((e.payload -> 'lines')::jsonb) AS line
  WHERE e.event_type = 'intake.recorded'
)
SELECT
  intake.day,
  intake.material_type_id,
  COALESCE(mt.name, intake.material_type_id) AS material_name,
  COALESCE(cp.name, 'Heuwelkroon parkie') AS location_text,
  COALESCE(SUM(intake.weight_kg), 0)::numeric(12, 3) AS total_weight_kg,
  COALESCE(SUM(intake.points_awarded), 0)::numeric(12, 1) AS total_points
FROM intake_lines intake
LEFT JOIN material_type mt ON mt.id::text = intake.material_type_id
LEFT JOIN collection_point cp ON cp.id::text = intake.collection_point_id
WHERE intake.material_type_id IS NOT NULL
GROUP BY intake.day, intake.material_type_id, COALESCE(mt.name, intake.material_type_id), COALESCE(cp.name, 'Heuwelkroon parkie');

CREATE INDEX mv_materials_collected_daily_day_idx
  ON mv_materials_collected_daily (day DESC);

CREATE INDEX mv_materials_collected_daily_material_idx
  ON mv_materials_collected_daily (material_type_id);

CREATE INDEX mv_materials_collected_daily_location_idx
  ON mv_materials_collected_daily (location_text);
