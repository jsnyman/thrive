import { describe, expect, test, vi } from "vitest";
import { createReportsClient } from "./reports-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createReportsClient", () => {
  test("loads materials report with filters", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        rows: [
          {
            day: "2026-03-09",
            materialTypeId: "mat-1",
            materialName: "PET",
            locationText: "Village A",
            totalWeightKg: 2.9,
            totalPoints: 8,
          },
        ],
        appliedFilters: {
          fromDate: "2026-03-01",
          toDate: "2026-03-31",
          locationText: "Village A",
          materialTypeId: "mat-1",
        },
      }),
    );
    const client = createReportsClient({ fetchFn, baseUrl: "/api" });

    const report = await client.getMaterialsCollectedReport({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      locationText: "Village A",
      materialTypeId: "mat-1",
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.materialName).toBe("PET");
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/reports/materials-collected?fromDate=2026-03-01&toDate=2026-03-31&locationText=Village+A&materialTypeId=mat-1",
    );
  });

  test("throws deterministic errors for non-ok and invalid responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            {
              day: "2026-03-09",
              materialTypeId: "mat-1",
              materialName: "PET",
              locationText: "Village A",
              totalWeightKg: "bad",
              totalPoints: 8,
            },
          ],
          appliedFilters: {
            fromDate: "2026-03-01",
            toDate: "2026-03-31",
            locationText: null,
            materialTypeId: null,
          },
        }),
      );
    const client = createReportsClient({ fetchFn });

    await expect(client.getMaterialsCollectedReport()).rejects.toThrow(
      "Materials report fetch failed with status 500",
    );
    await expect(client.getMaterialsCollectedReport()).rejects.toThrow(
      "Invalid materials report row",
    );
  });

  test("loads points liability report with search filter", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        rows: [
          {
            personId: "person-1",
            name: "Jane",
            surname: "Doe",
            balancePoints: 38.7,
          },
        ],
        summary: {
          totalOutstandingPoints: 38.7,
          personCount: 1,
        },
        appliedFilters: {
          search: "jane",
        },
      }),
    );
    const client = createReportsClient({ fetchFn, baseUrl: "/api" });

    const report = await client.getPointsLiabilityReport({
      search: "jane",
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.balancePoints).toBe(38.7);
    expect(report.summary.totalOutstandingPoints).toBe(38.7);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/reports/points-liability?search=jane");
  });

  test("throws deterministic errors for invalid points liability responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            {
              personId: "person-1",
              name: "Jane",
              surname: "Doe",
              balancePoints: "bad",
            },
          ],
          summary: {
            totalOutstandingPoints: 38.7,
            personCount: 1,
          },
          appliedFilters: {
            search: null,
          },
        }),
      );
    const client = createReportsClient({ fetchFn });

    await expect(client.getPointsLiabilityReport()).rejects.toThrow(
      "Points liability report fetch failed with status 500",
    );
    await expect(client.getPointsLiabilityReport()).rejects.toThrow(
      "Invalid points liability report row",
    );
  });

  test("loads inventory status report", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        summary: [
          {
            status: "storage",
            totalQuantity: 10,
            totalCostValue: 42.5,
          },
        ],
        rows: [
          {
            status: "storage",
            itemId: "item-1",
            itemName: "Soap",
            quantity: 10,
            unitCost: 4.25,
            totalCostValue: 42.5,
          },
        ],
      }),
    );
    const client = createReportsClient({ fetchFn, baseUrl: "/api" });

    const report = await client.getInventoryStatusReport();

    expect(report.summary[0]?.totalCostValue).toBe(42.5);
    expect(report.rows[0]?.itemName).toBe("Soap");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/reports/inventory-status");
  });

  test("throws deterministic errors for invalid inventory status responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          summary: [
            {
              status: "storage",
              totalQuantity: "bad",
              totalCostValue: 42.5,
            },
          ],
          rows: [],
        }),
      );
    const client = createReportsClient({ fetchFn });

    await expect(client.getInventoryStatusReport()).rejects.toThrow(
      "Inventory status report fetch failed with status 500",
    );
    await expect(client.getInventoryStatusReport()).rejects.toThrow(
      "Invalid inventory status report summary row",
    );
  });

  test("loads inventory status log report with filters", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        rows: [
          {
            eventId: "evt-1",
            eventType: "inventory.status_changed",
            occurredAt: "2026-03-08T10:00:00.000Z",
            inventoryBatchId: "batch-1",
            itemId: "item-1",
            itemName: "Soap",
            fromStatus: "storage",
            toStatus: "shop",
            quantity: 4,
            reason: "Move to shop",
            notes: null,
          },
        ],
        appliedFilters: {
          fromDate: "2026-03-01",
          toDate: "2026-03-31",
          fromStatus: "storage",
          toStatus: "shop",
        },
      }),
    );
    const client = createReportsClient({ fetchFn, baseUrl: "/api" });

    const report = await client.getInventoryStatusLogReport({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      fromStatus: "storage",
      toStatus: "shop",
    });

    expect(report.rows[0]?.inventoryBatchId).toBe("batch-1");
    expect(report.rows[0]?.itemName).toBe("Soap");
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/reports/inventory-status-log?fromDate=2026-03-01&toDate=2026-03-31&fromStatus=storage&toStatus=shop",
    );
  });

  test("throws deterministic errors for invalid inventory status log responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            {
              eventId: "evt-1",
              eventType: "inventory.status_changed",
              occurredAt: "2026-03-08T10:00:00.000Z",
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              itemName: "Soap",
              fromStatus: "storage",
              toStatus: "shop",
              quantity: "bad",
              reason: "Move to shop",
              notes: null,
            },
          ],
          appliedFilters: {
            fromDate: "2026-03-01",
            toDate: "2026-03-31",
            fromStatus: null,
            toStatus: null,
          },
        }),
      );
    const client = createReportsClient({ fetchFn });

    await expect(client.getInventoryStatusLogReport()).rejects.toThrow(
      "Inventory status log report fetch failed with status 500",
    );
    await expect(client.getInventoryStatusLogReport()).rejects.toThrow(
      "Invalid inventory status log report row",
    );
  });

  test("loads sales report with filters", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        rows: [
          {
            day: "2026-03-08",
            itemId: "item-1",
            itemName: "Soap",
            locationText: "Village A",
            totalQuantity: 5,
            totalPoints: 52.5,
            saleCount: 2,
          },
        ],
        summary: {
          totalQuantity: 5,
          totalPoints: 52.5,
          saleCount: 2,
        },
        appliedFilters: {
          fromDate: "2026-03-01",
          toDate: "2026-03-31",
          locationText: "Village A",
          itemId: "item-1",
        },
      }),
    );
    const client = createReportsClient({ fetchFn, baseUrl: "/api" });

    const report = await client.getSalesReport({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      locationText: "Village A",
      itemId: "item-1",
    });

    expect(report.rows[0]?.itemName).toBe("Soap");
    expect(report.summary.totalPoints).toBe(52.5);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/reports/sales?fromDate=2026-03-01&toDate=2026-03-31&locationText=Village+A&itemId=item-1",
    );
  });

  test("throws deterministic errors for invalid sales report responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            {
              day: "2026-03-08",
              itemId: "item-1",
              itemName: "Soap",
              locationText: "Village A",
              totalQuantity: "bad",
              totalPoints: 52.5,
              saleCount: 2,
            },
          ],
          summary: {
            totalQuantity: 5,
            totalPoints: 52.5,
            saleCount: 2,
          },
          appliedFilters: {
            fromDate: "2026-03-01",
            toDate: "2026-03-31",
            locationText: null,
            itemId: null,
          },
        }),
      );
    const client = createReportsClient({ fetchFn });

    await expect(client.getSalesReport()).rejects.toThrow(
      "Sales report fetch failed with status 500",
    );
    await expect(client.getSalesReport()).rejects.toThrow("Invalid sales report row");
  });

  test("loads cashflow report with filters", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        rows: [
          {
            day: "2026-03-08",
            salesPointsValue: 52.5,
            expenseCashTotal: 18.5,
            netCashflow: 34,
            saleCount: 2,
            expenseCount: 1,
          },
        ],
        summary: {
          totalSalesPointsValue: 52.5,
          totalExpenseCash: 18.5,
          netCashflow: 34,
          saleCount: 2,
          expenseCount: 1,
        },
        expenseCategories: [
          {
            category: "Fuel",
            totalCashAmount: 18.5,
            expenseCount: 1,
          },
        ],
        appliedFilters: {
          fromDate: "2026-03-01",
          toDate: "2026-03-31",
          locationText: "Village A",
        },
      }),
    );
    const client = createReportsClient({ fetchFn, baseUrl: "/api" });

    const report = await client.getCashflowReport({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      locationText: "Village A",
    });

    expect(report.rows[0]?.salesPointsValue).toBe(52.5);
    expect(report.expenseCategories[0]?.category).toBe("Fuel");
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/reports/cashflow?fromDate=2026-03-01&toDate=2026-03-31&locationText=Village+A",
    );
  });

  test("throws deterministic errors for invalid cashflow responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(
        jsonResponse({
          rows: [
            {
              day: "2026-03-08",
              salesPointsValue: "bad",
              expenseCashTotal: 18.5,
              netCashflow: 34,
              saleCount: 2,
              expenseCount: 1,
            },
          ],
          summary: {
            totalSalesPointsValue: 52.5,
            totalExpenseCash: 18.5,
            netCashflow: 34,
            saleCount: 2,
            expenseCount: 1,
          },
          expenseCategories: [],
          appliedFilters: {
            fromDate: null,
            toDate: null,
            locationText: null,
          },
        }),
      );
    const client = createReportsClient({ fetchFn });

    await expect(client.getCashflowReport()).rejects.toThrow(
      "Cashflow report fetch failed with status 500",
    );
    await expect(client.getCashflowReport()).rejects.toThrow("Invalid cashflow report row");
  });
});
