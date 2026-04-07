import { describe, expect, test, vi } from "vitest";
import { createAdjustmentsClient } from "./adjustments-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createAdjustmentsClient", () => {
  test("lists adjustment requests", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        requests: [
          {
            requestEventId: "evt-1",
            requestType: "points",
            status: "pending",
            requestedAt: "2026-03-05T12:00:00.000Z",
            requestedByUserId: "user-1",
            personId: "person-a",
            inventoryBatchId: null,
            requestedStatus: null,
            deltaPoints: 2.5,
            quantity: 2.5,
            reason: "fix",
            notes: null,
            resolvedByUserId: null,
            resolvedAt: null,
            resolutionNotes: null,
          },
        ],
        nextCursor: null,
      }),
    );
    const client = createAdjustmentsClient({ fetchFn, baseUrl: "/api" });

    const result = await client.listRequests({ requestType: "points", status: "pending" });

    expect(result.requests).toHaveLength(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/adjustments/requests?type=points&status=pending");
  });

  test("applies points adjustment", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ eventId: "evt-2" }, 201));
    const client = createAdjustmentsClient({ fetchFn, baseUrl: "/api" });

    const response = await client.applyPointsAdjustment({
      requestEventId: "evt-1",
      personId: "person-a",
      deltaPoints: 1.5,
      reason: "approved",
    });

    expect(response.eventId).toBe("evt-2");
  });
});
