import { describe, expect, test, vi } from "vitest";
import { createItemsClient } from "./items-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("items client", () => {
  test("lists items", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: "item-1",
            name: "Soap",
            pointsPrice: 10,
            costPrice: 4,
            sku: "SOAP-1",
          },
        ],
      }),
    );
    const client = createItemsClient({ fetchFn });

    const items = await client.listItems();

    expect(items).toEqual([
      {
        id: "item-1",
        name: "Soap",
        pointsPrice: 10,
        costPrice: 4,
        sku: "SOAP-1",
      },
    ]);
  });

  test("throws for non-ok responses", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "BAD" }, 500));
    const client = createItemsClient({ fetchFn });

    await expect(client.listItems()).rejects.toThrow("Items fetch failed with status 500");
  });
});
