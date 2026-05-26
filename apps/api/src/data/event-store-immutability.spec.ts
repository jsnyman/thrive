import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("event store append-only behavior", () => {
  test("event-store SQL does not include event update/delete mutations", () => {
    const path = join(process.cwd(), "apps", "api", "src", "data", "event-store.ts");
    const source = readFileSync(path, "utf8").toLowerCase();

    expect(source).not.toContain("update event");
    expect(source).not.toContain("delete from event");
    expect(source).toContain("insert into event");
    expect(source).toContain("on conflict (event_id) do nothing");
  });

  test("event-store INSERT casts event_type to the correct PostgreSQL enum name", () => {
    const path = join(process.cwd(), "apps", "api", "src", "data", "event-store.ts");
    const source = readFileSync(path, "utf8");

    // The PostgreSQL enum is "EventType" (quoted, PascalCase) — not ::event_type (lowercase).
    // Using the wrong name produces error 42704 "type event_type does not exist".
    expect(source).toContain('$2::"EventType"');
    expect(source).not.toContain("$2::event_type");
  });
});
