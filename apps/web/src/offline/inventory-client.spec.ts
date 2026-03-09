import { describe, expect, test, vi } from "vitest";
import { createInventoryClient } from "./inventory-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createInventoryClient", () => {
  test("lists inventory summary and batches", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          summary: [
            {
              status: "storage",
              totalQuantity: 12,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 10,
                shop: 2,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        }),
      );
    const client = createInventoryClient({ fetchFn });

    const summary = await client.listStatusSummary();
    const batches = await client.listBatches();

    expect(summary[0]?.status).toBe("storage");
    expect(batches[0]?.quantities.shop).toBe(2);
  });

  test("throws deterministic errors for non-ok responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500));
    const client = createInventoryClient({ fetchFn });

    await expect(client.listStatusSummary()).rejects.toThrow(
      "Inventory summary fetch failed with status 500",
    );
    await expect(client.listBatches()).rejects.toThrow(
      "Inventory batches fetch failed with status 500",
    );
  });
});
