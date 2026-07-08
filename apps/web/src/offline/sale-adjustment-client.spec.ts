import { describe, expect, test, vi } from "vitest";
import { createSaleAdjustmentRequestsClient } from "./sale-adjustment-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("createSaleAdjustmentRequestsClient", () => {
  test("posts the adjustment request and returns the requestEventId", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ requestEventId: "request-1" }, 201));
    const client = createSaleAdjustmentRequestsClient({ fetchFn, baseUrl: "/api" });

    const result = await client.requestAdjustment({
      saleEventId: "sale-1",
      personId: "person-1",
      note: "Please refund points, item was damaged",
    });

    expect(result).toEqual({ requestEventId: "request-1" });
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/sales/adjustment-requests");
    const init = fetchFn.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      saleEventId: "sale-1",
      personId: "person-1",
      note: "Please refund points, item was damaged",
    });
  });

  test("throws a deterministic error when the sale cannot be found", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "SALE_NOT_FOUND" }, 404));
    const client = createSaleAdjustmentRequestsClient({ fetchFn });

    await expect(
      client.requestAdjustment({ saleEventId: "sale-1", personId: "person-1", note: "Note" }),
    ).rejects.toThrow("SALE_NOT_FOUND");
  });

  test("throws a deterministic error for other non-ok responses", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}, 500));
    const client = createSaleAdjustmentRequestsClient({ fetchFn });

    await expect(
      client.requestAdjustment({ saleEventId: "sale-1", personId: "person-1", note: "Note" }),
    ).rejects.toThrow("Sale adjustment request failed with status 500");
  });
});
