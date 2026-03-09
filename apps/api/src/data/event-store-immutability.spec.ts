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
});
