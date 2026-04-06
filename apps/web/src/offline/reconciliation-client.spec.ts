import { describe, expect, test, vi } from "vitest";
import { createReconciliationClient } from "./reconciliation-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("createReconciliationClient", () => {
  test("loads reconciliation report with filters", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        generatedAt: "2026-03-12T12:00:00.000Z",
        summary: {
          totalIssues: 1,
          errorCount: 1,
          warningCount: 0,
          repairableCount: 1,
        },
        issues: [
          {
            issueId: "POINTS_BALANCE_MISMATCH:person-1",
            code: "POINTS_BALANCE_MISMATCH",
            severity: "error",
            entityType: "person",
            entityId: "person-1",
            detail: "Projected balance does not match event-log balance.",
            detectedAt: "2026-03-12T12:00:00.000Z",
            expected: { balancePoints: 38.7 },
            actual: { balancePoints: 35.7 },
            suggestedRepair: {
              repairKind: "points_adjustment",
              deltaPoints: 3,
              reasonTemplate: "Reconciliation correction",
            },
          },
        ],
        nextCursor: null,
      }),
    );
    const client = createReconciliationClient({ fetchFn });
    const response = await client.getReport({
      limit: 10,
      code: "POINTS_BALANCE_MISMATCH",
      repairableOnly: true,
    });

    expect(response.summary.totalIssues).toBe(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/sync/reconciliation/report?limit=10&code=POINTS_BALANCE_MISMATCH&repairableOnly=true",
    );
  });

  test("repairs issue and parses rebuild response", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        issueId: "PROJECTION_CURSOR_DRIFT:default",
        repairKind: "projection_rebuild",
        rebuiltAt: "2026-03-12T12:01:00.000Z",
      }),
    );
    const client = createReconciliationClient({ fetchFn });
    const response = await client.repairIssue("PROJECTION_CURSOR_DRIFT:default", "rebuild now");

    expect(response.repairKind).toBe("projection_rebuild");
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "/api/sync/reconciliation/issues/PROJECTION_CURSOR_DRIFT%3Adefault/repair",
    );
  });
});
