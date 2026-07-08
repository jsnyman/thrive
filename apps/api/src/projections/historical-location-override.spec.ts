import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("mv_materials_collected_daily historical location override SQL", () => {
  test("projections.sql resolves location via collection_point, falling back to Heuwelkroon parkie", () => {
    const sqlPath = join(process.cwd(), "apps", "api", "prisma", "projections.sql");
    const sql = readFileSync(sqlPath, "utf8");

    expect(sql).toContain("e.payload ->> 'collectionPointId' as collection_point_id");
    expect(sql).toContain(
      "left join collection_point cp on cp.id::text = intake.collection_point_id",
    );
    expect(sql).toContain("coalesce(cp.name, 'Heuwelkroon parkie') as location_text");
    expect(sql).not.toContain("coalesce(nullif(trim(e.location_text), ''), 'Unspecified')");
  });

  test("migration recreates the view with the same collection-point resolution, without mutating old events", () => {
    const migrationPath = join(
      process.cwd(),
      "apps",
      "api",
      "prisma",
      "migrations",
      "20260707_materials_collected_location_override",
      "migration.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("DROP MATERIALIZED VIEW IF EXISTS mv_materials_collected_daily");
    expect(sql).toContain("e.payload ->> 'collectionPointId' AS collection_point_id");
    expect(sql).toContain(
      "LEFT JOIN collection_point cp ON cp.id::text = intake.collection_point_id",
    );
    expect(sql).toContain("COALESCE(cp.name, 'Heuwelkroon parkie') AS location_text");
    expect(sql).not.toMatch(/update|delete|alter table event\b/i);
  });
});
