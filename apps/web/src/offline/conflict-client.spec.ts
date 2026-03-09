import { describe, expect, test, vi } from "vitest";
import { createConflictClient } from "./conflict-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createConflictClient", () => {
  test("lists open conflicts", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        conflicts: [
          {
            conflictId: "conflict-1",
            detectedEventId: "event-1",
            detectedAt: "2026-03-07T08:00:00.000Z",
            entityType: "sale",
            entityId: "person-1",
            detectedEventIds: ["event-a", "event-b"],
            summary: "STALE_CURSOR_CONFLICT",
            resolved: false,
            resolvedAt: null,
            resolution: null,
            resolutionEventId: null,
            resolutionNotes: null,
            resolvedByUserId: null,
          },
        ],
        nextCursor: null,
      }),
    );

    const client = createConflictClient({
      fetchFn,
    });
    const response = await client.listConflicts("open");

    expect(response.conflicts).toHaveLength(1);
    const call = fetchFn.mock.calls[0];
    expect(call?.[0]).toBe("/sync/conflicts?status=open&limit=50");
  });

  test("resolves conflict with deterministic error on failure", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 409));
    const client = createConflictClient({
      fetchFn,
    });

    await expect(
      client.resolveConflict("conflict-1", {
        resolution: "accepted",
        notes: "manual",
      }),
    ).rejects.toThrow("Resolve conflict failed with status 409");
  });
});
