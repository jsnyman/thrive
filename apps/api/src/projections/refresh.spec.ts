import { refreshProjections } from "./refresh";

describe("refreshProjections", () => {
  test("refreshes all materialized views in order", async () => {
    const executed: string[] = [];
    await refreshProjections({
      $executeRawUnsafe: async (sql) => {
        executed.push(sql);
      },
    });

    expect(executed[0]).toBe("REFRESH MATERIALIZED VIEW mv_people");
    expect(executed[1]).toBe("REFRESH MATERIALIZED VIEW mv_points_ledger_entries");
    expect(executed[2]).toBe("REFRESH MATERIALIZED VIEW mv_points_balances");
    expect(executed[3]).toBe("REFRESH MATERIALIZED VIEW mv_inventory_status_summary");
    expect(executed[4]).toBe("REFRESH MATERIALIZED VIEW mv_materials_collected_daily");
    expect(executed[5]).toContain("insert into projection_freshness");
  });
});
