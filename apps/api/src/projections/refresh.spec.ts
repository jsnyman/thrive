import { refreshProjections } from "./refresh";

describe("refreshProjections", () => {
  test("refreshes all materialized views in order", async () => {
    const executed: string[] = [];
    await refreshProjections({
      $executeRawUnsafe: async (sql) => {
        executed.push(sql);
      },
    });

    expect(executed).toEqual([
      "REFRESH MATERIALIZED VIEW mv_people",
      "REFRESH MATERIALIZED VIEW mv_points_ledger_entries",
      "REFRESH MATERIALIZED VIEW mv_points_balances",
      "REFRESH MATERIALIZED VIEW mv_inventory_status_summary",
    ]);
  });
});
