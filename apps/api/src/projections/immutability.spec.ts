import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("event immutability SQL guard", () => {
  test("projections.sql defines append-only trigger for event table", () => {
    const sqlPath = join(process.cwd(), "apps", "api", "prisma", "projections.sql");
    const sql = readFileSync(sqlPath, "utf8");

    expect(sql).toContain("create or replace function prevent_event_mutation()");
    expect(sql).toContain("drop trigger if exists event_append_only_guard on event;");
    expect(sql).toContain("before update or delete on event");
  });
});
