import { describe, expect, test, vi } from "vitest";
import { createLedgerClient } from "./ledger-client";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

describe("createLedgerClient", () => {
  test("fetches balance and entries", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          balance: {
            personId: "person-1",
            balancePoints: 10,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [
            {
              id: "entry-1",
              personId: "person-1",
              deltaPoints: 5,
              occurredAt: "2026-03-08T08:00:00.000Z",
              sourceEventType: "intake.recorded",
              sourceEventId: "event-1",
            },
          ],
        }),
      );
    const client = createLedgerClient({ fetchFn, baseUrl: "/api" });

    const balance = await client.getBalance("person-1");
    const entries = await client.listEntries("person-1");

    expect(balance.balancePoints).toBe(10);
    expect(entries).toHaveLength(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("/api/ledger/person-1/balance");
    expect(fetchFn.mock.calls[1]?.[0]).toBe("/api/ledger/person-1/entries");
  });

  test("throws deterministic errors on non-ok responses", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 500));
    const client = createLedgerClient({ fetchFn });

    await expect(client.getBalance("person-1")).rejects.toThrow(
      "Ledger balance fetch failed with status 500",
    );
    await expect(client.listEntries("person-1")).rejects.toThrow(
      "Ledger entries fetch failed with status 500",
    );
  });

  test("throws on invalid response bodies", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ balance: { personId: "person-1", balancePoints: "bad" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ entries: [{ id: "entry-1" }] }));
    const client = createLedgerClient({ fetchFn });

    await expect(client.getBalance("person-1")).rejects.toThrow("Invalid ledger balance");
    await expect(client.listEntries("person-1")).rejects.toThrow("Invalid ledger entry");
  });
});
