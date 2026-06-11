import { describe, expect, test, vi } from "vitest";
import { createProcurementClient } from "./procurement-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createProcurementClient", () => {
  test("lists procurements and posts corrections", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          procurements: [
            {
              procurementEventId: "event-1",
              occurredAt: "2026-06-11T00:00:00.000Z",
              supplierName: "Village Supplier",
              tripDistanceKm: 12,
              cashTotal: 6,
              isEditable: true,
              lines: [
                {
                  itemId: "item-1",
                  inventoryBatchId: "batch-1",
                  quantity: 2,
                  unitCost: 3,
                  lineTotalCost: 6,
                  unitSellingPrice: 3.6,
                  markupPercent: 20,
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ eventId: "event-2" }, 201));
    const client = createProcurementClient({ fetchFn });

    const procurements = await client.listProcurements();
    await client.correctProcurement("event-1", {
      occurredAt: "2026-06-12T00:00:00.000Z",
      supplierName: "Village Supplier",
      tripDistanceKm: 12,
      reason: "user edit",
      lines: [
        {
          itemId: "item-1",
          inventoryBatchId: "batch-1",
          quantity: 3,
          unitCost: 3,
          markupPercent: 20,
        },
      ],
    });

    expect(procurements[0]?.lines[0]?.markupPercent).toBe(20);
    expect(fetchFn.mock.calls[1]?.[0]).toBe("/api/procurements/event-1/corrections");
  });

  test("throws deterministic errors for non-ok responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 409));
    const client = createProcurementClient({ fetchFn });

    await expect(client.listProcurements()).rejects.toThrow(
      "Procurements fetch failed with status 500",
    );
    await expect(
      client.correctProcurement("event-1", {
        occurredAt: "2026-06-12T00:00:00.000Z",
        supplierName: "Village Supplier",
        tripDistanceKm: 12,
        reason: "user edit",
        lines: [
          {
            itemId: "item-1",
            inventoryBatchId: "batch-1",
            quantity: 3,
            unitCost: 3,
            markupPercent: 20,
          },
        ],
      }),
    ).rejects.toThrow("Procurement correction failed with status 409");
  });
});
