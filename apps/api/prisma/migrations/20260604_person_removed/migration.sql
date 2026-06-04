ALTER TABLE "person" ADD COLUMN "removed_at" TIMESTAMPTZ(6);

ALTER TYPE "EventType" ADD VALUE 'person.removed';

-- Recreate mv_people to exclude removed persons
DROP MATERIALIZED VIEW IF EXISTS mv_people;
CREATE MATERIALIZED VIEW mv_people AS
SELECT
  p.id,
  p.name,
  p.surname,
  p.id_number AS "idNumber",
  p.phone,
  p.address,
  p.notes,
  p.created_at AS "createdAt"
FROM person p
WHERE p.removed_at IS NULL;

CREATE UNIQUE INDEX mv_people_id_idx ON mv_people (id);
