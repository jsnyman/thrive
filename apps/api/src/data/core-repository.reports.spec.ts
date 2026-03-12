import { createCoreRepository } from "./core-repository";
import { createEventStore } from "./event-store";

jest.mock("./event-store", () => ({
  createEventStore: jest.fn(),
}));

describe("core repository materials report", () => {
  test("queries grouped materials rows with optional filters", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    let capturedSql = "";
    let capturedParams: unknown[] = [];
    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
        capturedSql = sql;
        capturedParams = params;
        return [
          {
            day: new Date("2026-03-09T00:00:00.000Z"),
            material_type_id: "mat-1",
            material_name: "PET",
            location_text: "Village A",
            total_weight_kg: 7.25,
            total_points: 21.3,
          },
        ];
      },
      $queryRaw: async () => [],
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };
    const repository = createCoreRepository(prisma as never);

    const rows = await repository.listMaterialsCollectedReport({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      locationText: "village",
      materialTypeId: "mat-1",
    });

    expect(rows).toEqual([
      {
        day: "2026-03-09",
        materialTypeId: "mat-1",
        materialName: "PET",
        locationText: "Village A",
        totalWeightKg: 7.25,
        totalPoints: 21.3,
      },
    ]);
    expect(capturedSql).toContain("from mv_materials_collected_daily");
    expect(capturedSql).toContain(
      "where day >= $1::date and day <= $2::date and lower(location_text) like $3 and material_type_id = $4",
    );
    expect(capturedParams).toEqual(["2026-03-01", "2026-03-31", "%village%", "mat-1"]);
  });

  test("queries points liability rows and filtered summary", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    let capturedSql = "";
    let capturedParams: unknown[] = [];
    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
        capturedSql = sql;
        capturedParams = params;
        return [
          {
            person_id: "person-1",
            name: "Jane",
            surname: "Doe",
            balance_points: 38.7,
            total_outstanding_points: 50.2,
            person_count: 2,
          },
          {
            person_id: "person-2",
            name: "Alice",
            surname: "Zulu",
            balance_points: 11.5,
            total_outstanding_points: 50.2,
            person_count: 2,
          },
        ];
      },
      $queryRaw: async () => [],
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };
    const repository = createCoreRepository(prisma as never);

    const report = await repository.listPointsLiabilityReport({
      search: "do",
    });

    expect(report).toEqual({
      rows: [
        {
          personId: "person-1",
          name: "Jane",
          surname: "Doe",
          balancePoints: 38.7,
        },
        {
          personId: "person-2",
          name: "Alice",
          surname: "Zulu",
          balancePoints: 11.5,
        },
      ],
      summary: {
        totalOutstandingPoints: 50.2,
        personCount: 2,
      },
    });
    expect(capturedSql).toContain("from mv_points_balances b");
    expect(capturedSql).toContain("join mv_people p on p.id = b.person_id");
    expect(capturedSql).toContain(
      "where b.balance_points > 0 and (lower(p.name) like $1 or lower(p.surname) like $1)",
    );
    expect(capturedSql).toContain(
      "order by b.balance_points desc, p.surname asc, p.name asc, b.person_id asc",
    );
    expect(capturedParams).toEqual(["%do%"]);
  });

  test("builds inventory status report with zero summary statuses and positive detail rows", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: {
        findMany: async () => [
          { id: "item-1", name: "Soap", pointsPrice: 10.5, costPrice: 4.25, sku: null },
          { id: "item-2", name: "Rice", pointsPrice: 20.0, costPrice: 7.5, sku: null },
        ],
        findUnique: async () => null,
      },
      $queryRawUnsafe: async () => [],
      $queryRaw: async (...args: unknown[]) => {
        const sql = String(args[0]);
        if (sql.includes("from event")) {
          return [
            {
              event_type: "procurement.recorded",
              payload: {
                lines: [
                  {
                    itemId: "item-1",
                    inventoryBatchId: "batch-1",
                    quantity: 10,
                    unitCost: 4.25,
                    lineTotalCost: 42.5,
                  },
                  {
                    itemId: "item-2",
                    inventoryBatchId: "batch-2",
                    quantity: 3,
                    unitCost: 7.5,
                    lineTotalCost: 22.5,
                  },
                ],
              },
            },
            {
              event_type: "inventory.status_changed",
              payload: {
                inventoryBatchId: "batch-1",
                fromStatus: "storage",
                toStatus: "shop",
                quantity: 4,
              },
            },
            {
              event_type: "sale.recorded",
              payload: {
                lines: [
                  {
                    itemId: "item-1",
                    inventoryBatchId: "batch-1",
                    quantity: 1,
                    pointsPrice: 10.5,
                    lineTotalPoints: 10.5,
                  },
                ],
                totalPoints: 10.5,
              },
            },
          ];
        }
        return [];
      },
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };
    const repository = createCoreRepository(prisma as never);

    const report = await repository.listInventoryStatusReport();

    expect(report.summary).toEqual([
      { status: "storage", totalQuantity: 9, totalCostValue: 48 },
      { status: "shop", totalQuantity: 3, totalCostValue: 12.75 },
      { status: "sold", totalQuantity: 1, totalCostValue: 4.25 },
      { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
      { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
      { status: "missing", totalQuantity: 0, totalCostValue: 0 },
    ]);
    expect(report.rows).toEqual([
      {
        status: "storage",
        itemId: "item-2",
        itemName: "Rice",
        quantity: 3,
        unitCost: 7.5,
        totalCostValue: 22.5,
      },
      {
        status: "storage",
        itemId: "item-1",
        itemName: "Soap",
        quantity: 6,
        unitCost: 4.25,
        totalCostValue: 25.5,
      },
      {
        status: "shop",
        itemId: "item-1",
        itemName: "Soap",
        quantity: 3,
        unitCost: 4.25,
        totalCostValue: 12.75,
      },
      {
        status: "sold",
        itemId: "item-1",
        itemName: "Soap",
        quantity: 1,
        unitCost: 4.25,
        totalCostValue: 4.25,
      },
    ]);
  });

  test("builds inventory status log report with filters, ordering, and best-effort item resolution", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: {
        findMany: async () => [
          { id: "item-1", name: "Soap", pointsPrice: 10.5, costPrice: 4.25, sku: null },
        ],
        findUnique: async () => null,
      },
      $queryRawUnsafe: async () => [],
      $queryRaw: async (...args: unknown[]) => {
        const sql = String(args[0]);
        if (sql.includes("order by recorded_at asc, event_id asc")) {
          return [
            {
              event_type: "procurement.recorded",
              payload: {
                lines: [
                  {
                    itemId: "item-1",
                    inventoryBatchId: "batch-1",
                    quantity: 10,
                    unitCost: 4.25,
                    lineTotalCost: 42.5,
                  },
                ],
              },
            },
            {
              event_type: "inventory.status_changed",
              payload: {
                inventoryBatchId: "batch-1",
                fromStatus: "storage",
                toStatus: "shop",
                quantity: 4,
              },
            },
          ];
        }
        if (sql.includes("order by occurred_at desc, event_id desc")) {
          return [
            {
              event_id: "evt-3",
              event_type: "inventory.adjustment_requested",
              occurred_at: new Date("2026-03-08T12:00:00.000Z"),
              payload: {
                inventoryBatchId: "batch-1",
                requestedStatus: "spoiled",
                quantity: 1,
                reason: "request only",
                notes: "pending",
              },
            },
            {
              event_id: "evt-2",
              event_type: "inventory.adjustment_applied",
              occurred_at: new Date("2026-03-08T11:00:00.000Z"),
              payload: {
                inventoryBatchId: "batch-unknown",
                fromStatus: "shop",
                toStatus: "damaged",
                quantity: 1,
                reason: "broken",
                notes: "corner tear",
              },
            },
            {
              event_id: "evt-1b",
              event_type: "inventory.status_changed",
              occurred_at: new Date("2026-03-08T10:00:00.000Z"),
              payload: {
                inventoryBatchId: "batch-1",
                fromStatus: "storage",
                toStatus: "shop",
                quantity: 4,
                reason: "Move to shop",
                notes: null,
              },
            },
            {
              event_id: "evt-1a",
              event_type: "inventory.status_changed",
              occurred_at: new Date("2026-03-08T10:00:00.000Z"),
              payload: {
                inventoryBatchId: "batch-1",
                fromStatus: "storage",
                toStatus: "shop",
                quantity: 2,
                reason: null,
                notes: "older same timestamp",
              },
            },
          ];
        }
        return [];
      },
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };
    const repository = createCoreRepository(prisma as never);

    const report = await repository.listInventoryStatusLogReport({
      fromDate: "2026-03-08",
      toDate: "2026-03-08",
      fromStatus: "storage",
      toStatus: "shop",
    });

    expect(report).toEqual([
      {
        eventId: "evt-1b",
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
      {
        eventId: "evt-1a",
        eventType: "inventory.status_changed",
        occurredAt: "2026-03-08T10:00:00.000Z",
        inventoryBatchId: "batch-1",
        itemId: "item-1",
        itemName: "Soap",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 2,
        reason: null,
        notes: "older same timestamp",
      },
    ]);
  });

  test("builds sales report with grouping, summary, filters, and unknown location fallback", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: {
        findMany: async () => [
          { id: "item-1", name: "Soap", pointsPrice: 10.5, costPrice: 4.25, sku: null },
          { id: "item-2", name: "Rice", pointsPrice: 20.0, costPrice: 7.5, sku: null },
        ],
        findUnique: async () => null,
      },
      $queryRawUnsafe: async () => [],
      $queryRaw: async (...args: unknown[]) => {
        const sql = String(args[0]);
        if (sql.includes("where event_type = 'sale.recorded'")) {
          return [
            {
              event_id: "sale-3",
              occurred_at: new Date("2026-03-09T11:00:00.000Z"),
              location_text: null,
              payload: {
                lines: [
                  {
                    itemId: "item-2",
                    inventoryBatchId: "batch-2",
                    quantity: 1,
                    pointsPrice: 20.0,
                    lineTotalPoints: 20.0,
                  },
                ],
              },
            },
            {
              event_id: "sale-2",
              occurred_at: new Date("2026-03-08T10:30:00.000Z"),
              location_text: "Village A",
              payload: {
                lines: [
                  {
                    itemId: "item-1",
                    inventoryBatchId: "batch-1",
                    quantity: 3,
                    pointsPrice: 10.5,
                    lineTotalPoints: 31.5,
                  },
                ],
              },
            },
            {
              event_id: "sale-1",
              occurred_at: new Date("2026-03-08T09:00:00.000Z"),
              location_text: "Village A",
              payload: {
                lines: [
                  {
                    itemId: "item-1",
                    inventoryBatchId: "batch-1",
                    quantity: 2,
                    pointsPrice: 10.5,
                    lineTotalPoints: 21.0,
                  },
                  {
                    itemId: "item-2",
                    inventoryBatchId: "batch-2",
                    quantity: 1,
                    pointsPrice: 20.0,
                    lineTotalPoints: 20.0,
                  },
                ],
              },
            },
          ];
        }
        return [];
      },
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };
    const repository = createCoreRepository(prisma as never);

    const report = await repository.listSalesReport({
      fromDate: "2026-03-08",
      toDate: "2026-03-09",
      locationText: "village a",
      itemId: "item-1",
    });

    expect(report).toEqual({
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
    });

    const defaultReport = await repository.listSalesReport({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      locationText: null,
      itemId: null,
    });
    expect(defaultReport.rows).toEqual([
      {
        day: "2026-03-09",
        itemId: "item-2",
        itemName: "Rice",
        locationText: "Unknown",
        totalQuantity: 1,
        totalPoints: 20.0,
        saleCount: 1,
      },
      {
        day: "2026-03-08",
        itemId: "item-2",
        itemName: "Rice",
        locationText: "Village A",
        totalQuantity: 1,
        totalPoints: 20.0,
        saleCount: 1,
      },
      {
        day: "2026-03-08",
        itemId: "item-1",
        itemName: "Soap",
        locationText: "Village A",
        totalQuantity: 5,
        totalPoints: 52.5,
        saleCount: 2,
      },
    ]);
    expect(defaultReport.summary).toEqual({
      totalQuantity: 7,
      totalPoints: 92.5,
      saleCount: 4,
    });
  });

  test("builds cashflow report with daily totals, expense categories, filters, and procurement excluded", async () => {
    const createEventStoreMock = createEventStore as jest.MockedFunction<typeof createEventStore>;
    createEventStoreMock.mockReturnValue({
      appendEvent: async () => ({ status: "accepted" as const }),
      getLatestCursor: async () => null,
      pullEvents: async () => ({ events: [], nextCursor: null }),
      getProjectionFreshness: async () => ({ refreshedAt: null, cursor: null }),
      listEventsForMergeReplay: async () => [],
    });

    const prisma = {
      person: { findMany: async () => [], findUnique: async () => null },
      materialType: { findMany: async () => [], findUnique: async () => null },
      item: { findMany: async () => [], findUnique: async () => null },
      $queryRawUnsafe: async () => [],
      $queryRaw: async (...args: unknown[]) => {
        const sql = String(args[0]);
        if (sql.includes("where event_type in ('sale.recorded', 'expense.recorded')")) {
          return [
            {
              event_id: "expense-3",
              event_type: "expense.recorded",
              occurred_at: new Date("2026-03-09T12:00:00.000Z"),
              location_text: null,
              payload: {
                category: "Supplies",
                cashAmount: 5.25,
              },
            },
            {
              event_id: "expense-2",
              event_type: "expense.recorded",
              occurred_at: new Date("2026-03-08T14:00:00.000Z"),
              location_text: "Village A",
              payload: {
                category: "Fuel",
                cashAmount: 8.5,
              },
            },
            {
              event_id: "sale-2",
              event_type: "sale.recorded",
              occurred_at: new Date("2026-03-08T10:30:00.000Z"),
              location_text: "Village A",
              payload: {
                totalPoints: 31.5,
              },
            },
            {
              event_id: "expense-1",
              event_type: "expense.recorded",
              occurred_at: new Date("2026-03-08T09:30:00.000Z"),
              location_text: "Village A",
              payload: {
                category: "Fuel",
                cashAmount: 10.0,
              },
            },
            {
              event_id: "sale-1",
              event_type: "sale.recorded",
              occurred_at: new Date("2026-03-08T09:00:00.000Z"),
              location_text: "Village A",
              payload: {
                totalPoints: 21.0,
              },
            },
            {
              event_id: "procurement-1",
              event_type: "procurement.recorded",
              occurred_at: new Date("2026-03-08T08:00:00.000Z"),
              location_text: "Village A",
              payload: {
                cashTotal: 42.5,
              },
            },
          ];
        }
        return [];
      },
      $executeRawUnsafe: async () => 0,
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    };
    const repository = createCoreRepository(prisma as never);

    const report = await repository.listCashflowReport({
      fromDate: "2026-03-08",
      toDate: "2026-03-09",
      locationText: "village a",
    });

    expect(report).toEqual({
      rows: [
        {
          day: "2026-03-08",
          salesPointsValue: 52.5,
          expenseCashTotal: 18.5,
          netCashflow: 34,
          saleCount: 2,
          expenseCount: 2,
        },
      ],
      summary: {
        totalSalesPointsValue: 52.5,
        totalExpenseCash: 18.5,
        netCashflow: 34,
        saleCount: 2,
        expenseCount: 2,
      },
      expenseCategories: [
        {
          category: "Fuel",
          totalCashAmount: 18.5,
          expenseCount: 2,
        },
      ],
    });

    const defaultReport = await repository.listCashflowReport({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      locationText: null,
    });
    expect(defaultReport.rows).toEqual([
      {
        day: "2026-03-09",
        salesPointsValue: 0,
        expenseCashTotal: 5.25,
        netCashflow: -5.25,
        saleCount: 0,
        expenseCount: 1,
      },
      {
        day: "2026-03-08",
        salesPointsValue: 52.5,
        expenseCashTotal: 18.5,
        netCashflow: 34,
        saleCount: 2,
        expenseCount: 2,
      },
    ]);
    expect(defaultReport.expenseCategories).toEqual([
      {
        category: "Fuel",
        totalCashAmount: 18.5,
        expenseCount: 2,
      },
      {
        category: "Supplies",
        totalCashAmount: 5.25,
        expenseCount: 1,
      },
    ]);
    expect(defaultReport.summary).toEqual({
      totalSalesPointsValue: 52.5,
      totalExpenseCash: 23.75,
      netCashflow: 28.75,
      saleCount: 2,
      expenseCount: 3,
    });
  });
});
