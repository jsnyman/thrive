import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { createEventQueue, createMemoryEventQueueStore } from "./offline/event-queue";
import { createMemorySyncStateStore } from "./offline/sync-state-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });

const extractEventIdsFromPushBody = (body: unknown): string[] => {
  if (body === null || typeof body !== "object" || !("events" in body)) {
    return [];
  }
  const rawEvents = (body as Record<string, unknown>)["events"];
  if (!Array.isArray(rawEvents)) {
    return [];
  }
  const eventIds: string[] = [];
  for (const event of rawEvents) {
    if (event !== null && typeof event === "object" && "eventId" in event) {
      const eventId = (event as Record<string, unknown>)["eventId"];
      if (typeof eventId === "string") {
        eventIds.push(eventId);
      }
    }
  }
  return eventIds;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  globalThis.localStorage.clear();
});

const stubResizeObserver = (): void => {
  class ResizeObserverMock {
    observe(): void {
      return;
    }
    unobserve(): void {
      return;
    }
    disconnect(): void {
      return;
    }
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  Object.defineProperty(globalThis.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {
      return;
    },
  });
};

describe("App person registry", () => {
  test("login success stores token and shows registry view", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({ people: [] });
      }
      if (url.includes("/materials")) {
        return jsonResponse({ materials: [] });
      }
      if (url.includes("/items")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({ summary: [] });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({ batches: [] });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    expect(globalThis.localStorage.getItem("auth.token")).toBe("token-1");
  });

  test("create flow enqueues, syncs, refreshes list, and masks ID/phone", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();

    let peopleCallCount = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({
          conflicts: [],
          nextCursor: null,
        });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [
            {
              id: "mat-1",
              name: "PET",
              pointsPerKg: 3,
            },
          ],
        });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 10 },
            { status: "shop", totalQuantity: 0 },
            { status: "sold", totalQuantity: 0 },
            { status: "spoiled", totalQuantity: 0 },
            { status: "damaged", totalQuantity: 0 },
            { status: "missing", totalQuantity: 0 },
          ],
        });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 10,
                shop: 0,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        });
      }
      if (url.includes("/sync/push")) {
        return jsonResponse({
          acknowledgements: [
            { eventId: "11111111-1111-1111-1111-111111111111", status: "accepted" },
          ],
          latestCursor: "cursor-1",
        });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({ events: [], nextCursor: "cursor-1" });
      }
      if (url.includes("/sync/status")) {
        return jsonResponse({
          latestCursor: "cursor-1",
          projectionRefreshedAt: "2026-03-07T08:01:00.000Z",
          projectionCursor: "cursor-1",
        });
      }
      if (url.includes("/people")) {
        peopleCallCount += 1;
        if (peopleCallCount === 1) {
          return jsonResponse({
            people: [],
          });
        }
        return jsonResponse({
          people: [
            {
              id: "person-1",
              name: "Jane",
              surname: "Doe",
              idNumber: "8001015009087",
              phone: "0821234567",
            },
          ],
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-1111-1111-111111111111")
      .mockReturnValue("22222222-2222-2222-2222-222222222222");

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    await userEvent.type(view.getByLabelText("Name"), "Jane");
    await userEvent.type(view.getByLabelText("Surname"), "Doe");
    await userEvent.type(view.getByLabelText("ID Number"), "8001015009087");
    await userEvent.type(view.getByLabelText("Phone"), "0821234567");
    await userEvent.click(view.getByRole("button", { name: "Save Person" }));

    await waitFor(() => {
      expect(view.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    });

    expect(view.getByText("ID: ****87")).toBeInTheDocument();
    expect(view.getByText("Phone: ****67")).toBeInTheDocument();
    expect(view.queryByText("8001015009087")).not.toBeInTheDocument();
    expect(view.queryByText("0821234567")).not.toBeInTheDocument();
  }, 10000);

  test("edit flow queues update event and refreshes list", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();

    let peopleCallCount = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({
          conflicts: [],
          nextCursor: null,
        });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [
            {
              id: "mat-1",
              name: "PET",
              pointsPerKg: 3,
            },
          ],
        });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({
          summary: [{ status: "storage", totalQuantity: 10 }],
        });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 10,
                shop: 0,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        });
      }
      if (url.includes("/sync/push")) {
        return jsonResponse({
          acknowledgements: [
            { eventId: "33333333-3333-3333-3333-333333333333", status: "accepted" },
          ],
          latestCursor: "cursor-2",
        });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({ events: [], nextCursor: "cursor-2" });
      }
      if (url.includes("/sync/status")) {
        return jsonResponse({
          latestCursor: "cursor-2",
          projectionRefreshedAt: "2026-03-07T08:01:00.000Z",
          projectionCursor: "cursor-2",
        });
      }
      if (url.includes("/people")) {
        peopleCallCount += 1;
        if (peopleCallCount === 1) {
          return jsonResponse({
            people: [
              {
                id: "person-1",
                name: "Jane",
                surname: "Doe",
                idNumber: "8001015009087",
                phone: "0821234567",
              },
            ],
          });
        }
        return jsonResponse({
          people: [
            {
              id: "person-1",
              name: "Jane",
              surname: "Updated",
              idNumber: "8001015009087",
              phone: "0821234567",
            },
          ],
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "33333333-3333-3333-3333-333333333333",
    );

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    });

    await userEvent.click(view.getByRole("button", { name: "Edit" }));
    await userEvent.type(view.getAllByLabelText("Surname")[1]!, "Updated");
    await userEvent.click(view.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(view.getAllByText("Jane Updated").length).toBeGreaterThan(0);
    });
    await expect(queue.pendingCount()).resolves.toBe(0);
  });

  test("shows login and sync failure errors", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();

    const failedLoginFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "BAD" }, 401));
    vi.stubGlobal("fetch", failedLoginFetch);

    const firstView = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );
    await userEvent.type(firstView.getByLabelText("Username"), "manager");
    await userEvent.type(firstView.getByLabelText("Passcode"), "bad");
    await userEvent.click(firstView.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(firstView.getByText("Login failed with status 401")).toBeInTheDocument();
    });
    firstView.unmount();

    const syncFailureFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [
            {
              id: "mat-1",
              name: "PET",
              pointsPerKg: 3,
            },
          ],
        });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({ summary: [] });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({ batches: [] });
      }
      if (url.includes("/sync/push")) {
        return jsonResponse({ error: "BAD" }, 500);
      }
      if (url.includes("/people")) {
        return jsonResponse({ people: [] });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", syncFailureFetch);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "44444444-4444-4444-4444-444444444444",
    );

    const secondView = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );
    await userEvent.type(secondView.getByLabelText("Username"), "manager");
    await userEvent.type(secondView.getByLabelText("Passcode"), "1234");
    await userEvent.click(secondView.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(secondView.getByText("Person Registry")).toBeInTheDocument();
    });
    await userEvent.type(secondView.getByLabelText("Name"), "Jane");
    await userEvent.type(secondView.getByLabelText("Surname"), "Doe");
    await userEvent.click(secondView.getByRole("button", { name: "Save Person" }));

    await waitFor(() => {
      expect(
        secondView.getByText("Sync error: Sync push failed with status 500"),
      ).toBeInTheDocument();
    });
  });

  test("multi-line intake enqueues one event, syncs, and refreshes ledger", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    let capturedPushBody: unknown = null;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({
          people: [
            {
              id: "person-1",
              name: "Jane",
              surname: "Doe",
            },
          ],
        });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [
            {
              id: "mat-1",
              name: "PET",
              pointsPerKg: 3,
            },
            {
              id: "mat-2",
              name: "Glass",
              pointsPerKg: 2,
            },
          ],
        });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({
          summary: [{ status: "storage", totalQuantity: 10 }],
        });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 10,
                shop: 0,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({
          conflicts: [],
          nextCursor: null,
        });
      }
      if (url.includes("/sync/push")) {
        if (typeof init?.body === "string") {
          capturedPushBody = JSON.parse(init.body) as unknown;
        }
        const acknowledgements = extractEventIdsFromPushBody(capturedPushBody).map((eventId) => ({
          eventId,
          status: "accepted" as const,
        }));
        return jsonResponse({
          acknowledgements,
          latestCursor: "cursor-3",
        });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({ events: [], nextCursor: "cursor-3" });
      }
      if (url.includes("/sync/status")) {
        return jsonResponse({
          latestCursor: "cursor-3",
          projectionRefreshedAt: "2026-03-07T08:05:00.000Z",
          projectionCursor: "cursor-3",
        });
      }
      if (url.includes("/ledger/person-1/balance")) {
        return jsonResponse({
          balance: {
            personId: "person-1",
            balancePoints: 38,
          },
        });
      }
      if (url.includes("/ledger/person-1/entries")) {
        return jsonResponse({
          entries: [
            {
              id: "event-intake-1",
              personId: "person-1",
              deltaPoints: 8,
              occurredAt: "2026-03-07T08:05:00.000Z",
              sourceEventType: "intake.recorded",
              sourceEventId: "event-intake-1",
            },
          ],
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });

    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });
    await userEvent.type(view.getByLabelText("Weight Kg 1"), "2.9");
    await userEvent.click(view.getByRole("button", { name: "Add Line" }));
    await userEvent.click(view.getByRole("textbox", { name: "Material 2" }));
    await userEvent.click(view.getByRole("option", { name: "Glass (2 pts/kg)" }));
    await userEvent.type(view.getByLabelText("Weight Kg 2"), "1.5");

    await userEvent.click(view.getByRole("button", { name: "Record Intake" }));

    await waitFor(() => {
      expect(view.getByText("Balance: 38")).toBeInTheDocument();
    });
    expect(view.getByText("intake.recorded | +8")).toBeInTheDocument();
    await expect(queue.pendingCount()).resolves.toBe(0);

    expect(capturedPushBody).not.toBeNull();
    const body = capturedPushBody as {
      events: Array<{
        eventType: string;
        payload: {
          lines: Array<{
            materialTypeId: string;
            weightKg: number;
            pointsPerKg: number;
            pointsAwarded: number;
          }>;
          totalPoints: number;
        };
      }>;
    };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.eventType).toBe("intake.recorded");
    expect(body.events[0]?.payload.lines).toHaveLength(2);
    expect(body.events[0]?.payload.totalPoints).toBe(11);
  });

  test("intake validation blocks duplicate materials and invalid weights", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({
          people: [
            {
              id: "person-1",
              name: "Jane",
              surname: "Doe",
            },
          ],
        });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [
            {
              id: "mat-1",
              name: "PET",
              pointsPerKg: 3,
            },
            {
              id: "mat-2",
              name: "Glass",
              pointsPerKg: 2,
            },
          ],
        });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({
          summary: [{ status: "storage", totalQuantity: 10 }],
        });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 10,
                shop: 0,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });

    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    await userEvent.type(view.getByLabelText("Weight Kg 1"), "abc");
    await userEvent.click(view.getByRole("button", { name: "Record Intake" }));
    await waitFor(() => {
      expect(view.getByText("Each line weight must be greater than 0")).toBeInTheDocument();
    });

    await userEvent.clear(view.getByLabelText("Weight Kg 1"));
    await userEvent.type(view.getByLabelText("Weight Kg 1"), "1");
    await userEvent.click(view.getByRole("button", { name: "Add Line" }));
    await userEvent.type(view.getByLabelText("Weight Kg 2"), "1");
    await userEvent.click(view.getByRole("button", { name: "Record Intake" }));
    await waitFor(() => {
      expect(view.getByText("Duplicate materials are not allowed")).toBeInTheDocument();
    });
    await expect(queue.pendingCount()).resolves.toBe(0);
  });

  test("intake validation blocks missing person", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({
          people: [],
        });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [],
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });

    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    await userEvent.click(view.getByRole("button", { name: "Record Intake" }));
    await waitFor(() => {
      expect(view.getByText("Person is required")).toBeInTheDocument();
    });

    await expect(queue.pendingCount()).resolves.toBe(0);
  });

  test("intake validation blocks empty line set", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({
          people: [
            {
              id: "person-1",
              name: "Jane",
              surname: "Doe",
            },
          ],
        });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [
            {
              id: "mat-1",
              name: "PET",
              pointsPerKg: 3,
            },
          ],
        });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({
          summary: [{ status: "storage", totalQuantity: 10 }],
        });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 10,
                shop: 0,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });

    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    await userEvent.click(view.getByRole("button", { name: "Remove Line" }));
    await userEvent.click(view.getByRole("button", { name: "Record Intake" }));
    await waitFor(() => {
      expect(view.getByText("Add at least one intake line")).toBeInTheDocument();
    });
    await expect(queue.pendingCount()).resolves.toBe(0);
  });

  test("ledger balance auto-loads for selected person and shows source event id", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({
          people: [
            {
              id: "person-1",
              name: "Jane",
              surname: "Doe",
            },
          ],
        });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [],
        });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({ summary: [] });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({ batches: [] });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      if (url.includes("/ledger/person-1/balance")) {
        return jsonResponse({
          balance: {
            personId: "person-1",
            balancePoints: 12,
          },
        });
      }
      if (url.includes("/ledger/person-1/entries")) {
        return jsonResponse({
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
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });

    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Balance: 12")).toBeInTheDocument();
    });
    expect(view.getByText("Source: event-1")).toBeInTheDocument();
  });

  test("inventory status change enqueues event, syncs, and refreshes inventory summary", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    let capturedPushBody: unknown = null;
    let inventorySummaryCallCount = 0;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({ people: [] });
      }
      if (url.includes("/materials")) {
        return jsonResponse({ materials: [] });
      }
      if (url.includes("/inventory/status-summary")) {
        inventorySummaryCallCount += 1;
        return jsonResponse({
          summary:
            inventorySummaryCallCount > 1
              ? [{ status: "shop", totalQuantity: 4 }]
              : [{ status: "storage", totalQuantity: 10 }],
        });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 10,
                shop: 0,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      if (url.includes("/sync/push")) {
        if (typeof init?.body === "string") {
          capturedPushBody = JSON.parse(init.body) as unknown;
        }
        const acknowledgements = extractEventIdsFromPushBody(capturedPushBody).map((eventId) => ({
          eventId,
          status: "accepted" as const,
        }));
        return jsonResponse({
          acknowledgements,
          latestCursor: "cursor-1",
        });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({ events: [], nextCursor: "cursor-1" });
      }
      if (url.includes("/sync/status")) {
        return jsonResponse({
          latestCursor: "cursor-1",
          projectionRefreshedAt: "2026-03-08T09:00:00.000Z",
          projectionCursor: "cursor-1",
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    await userEvent.type(view.getAllByLabelText("Quantity")[0]!, "4");
    await userEvent.type(view.getAllByLabelText("Reason")[0]!, "restock shelf");
    await userEvent.click(view.getByRole("button", { name: "Move Inventory" }));

    await waitFor(() => {
      expect(view.getByText("shop: 4")).toBeInTheDocument();
    });

    const body = capturedPushBody as {
      events: Array<{
        eventType: string;
      }>;
    };
    expect(body.events[0]?.eventType).toBe("inventory.status_changed");
  });

  test("inventory adjustment request enqueues event and syncs", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    let capturedPushBody: unknown = null;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({ people: [] });
      }
      if (url.includes("/materials")) {
        return jsonResponse({ materials: [] });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({ summary: [{ status: "storage", totalQuantity: 10 }] });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 10,
                shop: 0,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      if (url.includes("/sync/push")) {
        if (typeof init?.body === "string") {
          capturedPushBody = JSON.parse(init.body) as unknown;
        }
        const acknowledgements = extractEventIdsFromPushBody(capturedPushBody).map((eventId) => ({
          eventId,
          status: "accepted" as const,
        }));
        return jsonResponse({
          acknowledgements,
          latestCursor: "cursor-2",
        });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({ events: [], nextCursor: "cursor-2" });
      }
      if (url.includes("/sync/status")) {
        return jsonResponse({
          latestCursor: "cursor-2",
          projectionRefreshedAt: "2026-03-08T09:02:00.000Z",
          projectionCursor: "cursor-2",
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    await userEvent.type(view.getAllByLabelText("Quantity")[1]!, "1");
    await userEvent.type(view.getAllByLabelText("Reason")[1]!, "damage");
    await userEvent.click(view.getByRole("button", { name: "Submit Adjustment Request" }));

    const body = capturedPushBody as {
      events: Array<{
        eventType: string;
      }>;
    };
    expect(body.events[0]?.eventType).toBe("inventory.adjustment_requested");
  });

  test("sale flow enqueues FIFO-expanded lines, syncs, and refreshes ledger", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    let capturedPushBody: unknown = null;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({
          people: [
            {
              id: "person-1",
              name: "Jane",
              surname: "Doe",
            },
          ],
        });
      }
      if (url.includes("/materials")) {
        return jsonResponse({ materials: [{ id: "mat-1", name: "PET", pointsPerKg: 3 }] });
      }
      if (url.includes("/items")) {
        return jsonResponse({ items: [{ id: "item-1", name: "Soap", pointsPrice: 10 }] });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0 },
            { status: "shop", totalQuantity: 5 },
            { status: "sold", totalQuantity: 0 },
            { status: "spoiled", totalQuantity: 0 },
            { status: "damaged", totalQuantity: 0 },
            { status: "missing", totalQuantity: 0 },
          ],
        });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 0,
                shop: 2,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
            {
              inventoryBatchId: "batch-2",
              itemId: "item-1",
              quantities: {
                storage: 0,
                shop: 3,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      if (url.includes("/sync/push")) {
        if (typeof init?.body === "string") {
          capturedPushBody = JSON.parse(init.body) as unknown;
        }
        return jsonResponse({
          acknowledgements: extractEventIdsFromPushBody(capturedPushBody).map((eventId) => ({
            eventId,
            status: "accepted" as const,
          })),
          latestCursor: "cursor-sale-1",
        });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({
          events: [],
          nextCursor: "cursor-sale-1",
        });
      }
      if (url.includes("/sync/status")) {
        return jsonResponse({
          latestCursor: "cursor-sale-1",
          projectionRefreshedAt: "2026-03-08T10:00:00.000Z",
          projectionCursor: "cursor-sale-1",
        });
      }
      if (url.includes("/ledger/person-1/balance")) {
        return jsonResponse({
          balance: {
            personId: "person-1",
            balancePoints: 20,
          },
        });
      }
      if (url.includes("/ledger/person-1/entries")) {
        return jsonResponse({
          entries: [
            {
              id: "event-sale-1",
              personId: "person-1",
              deltaPoints: -30,
              occurredAt: "2026-03-08T10:00:00.000Z",
              sourceEventType: "sale.recorded",
              sourceEventId: "event-sale-1",
            },
          ],
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Record Sale" })).toBeInTheDocument();
    });
    await userEvent.type(view.getByLabelText("Quantity 1"), "3");
    await userEvent.click(view.getByRole("button", { name: "Record Sale" }));

    await waitFor(() => {
      expect(view.getByText("sale.recorded | -30")).toBeInTheDocument();
    });
    await expect(queue.pendingCount()).resolves.toBe(0);

    const pushBody = capturedPushBody as {
      events: Array<{
        eventType: string;
        payload: {
          lines: Array<{
            inventoryBatchId: string | null;
            quantity: number;
          }>;
          totalPoints: number;
        };
      }>;
    };
    expect(pushBody.events).toHaveLength(1);
    expect(pushBody.events[0]?.eventType).toBe("sale.recorded");
    expect(pushBody.events[0]?.payload.totalPoints).toBe(30);
    expect(pushBody.events[0]?.payload.lines).toHaveLength(2);
    expect(pushBody.events[0]?.payload.lines[0]?.inventoryBatchId).toBe("batch-1");
    expect(pushBody.events[0]?.payload.lines[0]?.quantity).toBe(2);
    expect(pushBody.events[0]?.payload.lines[1]?.inventoryBatchId).toBe("batch-2");
    expect(pushBody.events[0]?.payload.lines[1]?.quantity).toBe(1);
  });

  test("procurement flow enqueues event, syncs, and refreshes inventory", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    let capturedPushBody: unknown = null;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({
          people: [{ id: "person-1", name: "Jane", surname: "Doe" }],
        });
      }
      if (url.includes("/materials")) {
        return jsonResponse({ materials: [{ id: "mat-1", name: "PET", pointsPerKg: 3 }] });
      }
      if (url.includes("/items")) {
        return jsonResponse({
          items: [{ id: "item-1", name: "Soap", pointsPrice: 10 }],
        });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({
          summary: [{ status: "storage", totalQuantity: 10 }],
        });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({
          batches: [
            {
              inventoryBatchId: "batch-1",
              itemId: "item-1",
              quantities: {
                storage: 10,
                shop: 0,
                sold: 0,
                spoiled: 0,
                damaged: 0,
                missing: 0,
              },
            },
          ],
        });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      if (url.includes("/sync/push")) {
        if (typeof init?.body === "string") {
          capturedPushBody = JSON.parse(init.body) as unknown;
        }
        return jsonResponse({
          acknowledgements: extractEventIdsFromPushBody(capturedPushBody).map((eventId) => ({
            eventId,
            status: "accepted" as const,
          })),
          latestCursor: "cursor-procurement-1",
        });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({ events: [], nextCursor: "cursor-procurement-1" });
      }
      if (url.includes("/sync/status")) {
        return jsonResponse({
          latestCursor: "cursor-procurement-1",
          projectionRefreshedAt: "2026-03-08T11:00:00.000Z",
          projectionCursor: "cursor-procurement-1",
        });
      }
      if (url.includes("/ledger/person-1/balance")) {
        return jsonResponse({
          balance: {
            personId: "person-1",
            balancePoints: 20,
          },
        });
      }
      if (url.includes("/ledger/person-1/entries")) {
        return jsonResponse({ entries: [] });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Record Procurement" })).toBeInTheDocument();
    });
    await userEvent.type(view.getByLabelText("Procurement Quantity 1"), "2");
    await userEvent.type(view.getByLabelText("Unit Cost 1"), "3");
    await userEvent.click(view.getByRole("button", { name: "Record Procurement" }));

    await waitFor(() => {
      expect(view.getByText("Pending events: 0")).toBeInTheDocument();
    });
    const pushBody = capturedPushBody as {
      events: Array<{
        eventType: string;
        payload: {
          cashTotal: number;
          lines: Array<{
            itemId: string;
            inventoryBatchId: string;
            quantity: number;
            unitCost: number;
            lineTotalCost: number;
          }>;
        };
      }>;
    };
    expect(pushBody.events).toHaveLength(1);
    expect(pushBody.events[0]?.eventType).toBe("procurement.recorded");
    expect(pushBody.events[0]?.payload.cashTotal).toBe(6);
    expect(pushBody.events[0]?.payload.lines[0]?.itemId).toBe("item-1");
    expect(pushBody.events[0]?.payload.lines[0]?.quantity).toBe(2);
    expect(pushBody.events[0]?.payload.lines[0]?.unitCost).toBe(3);
    expect(pushBody.events[0]?.payload.lines[0]?.lineTotalCost).toBe(6);
    expect(typeof pushBody.events[0]?.payload.lines[0]?.inventoryBatchId).toBe("string");
  });

  test("procurement panel is hidden for non-manager", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-2",
            username: "operator",
            role: "shop_operator",
          },
          token: "token-2",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({ people: [] });
      }
      if (url.includes("/materials")) {
        return jsonResponse({ materials: [] });
      }
      if (url.includes("/items")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({ summary: [] });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({ batches: [] });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "operator");
    await userEvent.type(view.getByLabelText("Passcode"), "3333");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });
    expect(view.queryByRole("heading", { name: "Record Procurement" })).not.toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "Record Expense" })).not.toBeInTheDocument();
  });

  test("expense flow enqueues event, syncs, and clears pending count", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    let capturedPushBody: unknown = null;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({ people: [] });
      }
      if (url.includes("/materials")) {
        return jsonResponse({ materials: [] });
      }
      if (url.includes("/items")) {
        return jsonResponse({ items: [{ id: "item-1", name: "Soap", pointsPrice: 10 }] });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({ summary: [{ status: "storage", totalQuantity: 10 }] });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({ batches: [] });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      if (url.includes("/sync/push")) {
        if (typeof init?.body === "string") {
          capturedPushBody = JSON.parse(init.body) as unknown;
        }
        return jsonResponse({
          acknowledgements: extractEventIdsFromPushBody(capturedPushBody).map((eventId) => ({
            eventId,
            status: "accepted" as const,
          })),
          latestCursor: "cursor-expense-1",
        });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({ events: [], nextCursor: "cursor-expense-1" });
      }
      if (url.includes("/sync/status")) {
        return jsonResponse({
          latestCursor: "cursor-expense-1",
          projectionRefreshedAt: "2026-03-08T12:00:00.000Z",
          projectionCursor: "cursor-expense-1",
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Record Expense" })).toBeInTheDocument();
    });

    await userEvent.type(view.getByLabelText("Expense Category"), "Fuel");
    await userEvent.type(view.getByLabelText("Expense Cash Amount"), "45.5");
    await userEvent.type(view.getByLabelText("Expense Notes"), "Village route");
    await userEvent.type(view.getByLabelText("Expense Receipt Ref"), "R-77");
    await userEvent.click(view.getByRole("button", { name: "Record Expense" }));

    await waitFor(() => {
      expect(view.getByText("Pending events: 0")).toBeInTheDocument();
    });

    const pushBody = capturedPushBody as {
      events: Array<{
        eventType: string;
        payload: {
          category: string;
          cashAmount: number;
          notes: string | null;
          receiptRef: string | null;
        };
      }>;
    };
    expect(pushBody.events).toHaveLength(1);
    expect(pushBody.events[0]?.eventType).toBe("expense.recorded");
    expect(pushBody.events[0]?.payload.category).toBe("Fuel");
    expect(pushBody.events[0]?.payload.cashAmount).toBe(45.5);
    expect(pushBody.events[0]?.payload.notes).toBe("Village route");
    expect(pushBody.events[0]?.payload.receiptRef).toBe("R-77");
  }, 10000);

  test("expense validation blocks invalid submit and sync failures are shown", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "manager",
            role: "manager",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({ people: [] });
      }
      if (url.includes("/materials")) {
        return jsonResponse({ materials: [] });
      }
      if (url.includes("/items")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/inventory/status-summary")) {
        return jsonResponse({ summary: [] });
      }
      if (url.includes("/inventory/batches")) {
        return jsonResponse({ batches: [] });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
      }
      if (url.includes("/sync/push")) {
        return jsonResponse({ error: "BAD" }, 500);
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App queue={queue} syncStateStore={syncStateStore} />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "manager");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Record Expense" })).toBeInTheDocument();
    });

    await userEvent.click(view.getByRole("button", { name: "Record Expense" }));
    await waitFor(() => {
      expect(view.getByText("Category is required")).toBeInTheDocument();
    });

    await userEvent.type(view.getByLabelText("Expense Category"), "Fuel");
    await userEvent.type(view.getByLabelText("Expense Cash Amount"), "-1");
    await userEvent.click(view.getByRole("button", { name: "Record Expense" }));
    await waitFor(() => {
      expect(view.getByText("Cash amount must be 0 or greater")).toBeInTheDocument();
    });

    await userEvent.clear(view.getByLabelText("Expense Cash Amount"));
    await userEvent.type(view.getByLabelText("Expense Cash Amount"), "12");
    await userEvent.click(view.getByRole("button", { name: "Record Expense" }));
    await waitFor(() => {
      expect(view.getByText("Sync error: Sync push failed with status 500")).toBeInTheDocument();
    });
  });
});
