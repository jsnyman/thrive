import { cleanup, render, waitFor } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { createEventQueue, createMemoryEventQueueStore } from "./offline/event-queue";
import { createMemorySyncStateStore } from "./offline/sync-state-store";

vi.setConfig({ testTimeout: 15000 });

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

const openManagerPanel = async (view: RenderResult, buttonName: string): Promise<void> => {
  if (view.queryByRole("button", { name: buttonName }) === null) {
    await userEvent.click(view.getByRole("button", { name: "Reports" }));
  }
  await userEvent.click(view.getByRole("button", { name: buttonName }));
};

describe("App person registry", () => {
  test("login inputs use a fixed sensible maximum width", () => {
    stubResizeObserver();

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    const usernameField = view.getByLabelText("Username");
    const passcodeField = view.getByLabelText("Passcode");
    const usernameWrapper = usernameField.closest("div[style*='max-width: 300px']");
    const passcodeWrapper = passcodeField.closest("div[style*='max-width: 300px']");

    expect(usernameWrapper).not.toBeNull();
    expect(passcodeWrapper).not.toBeNull();
    expect(usernameWrapper).toHaveStyle({
      maxWidth: "300px",
      width: "100%",
    });
    expect(passcodeWrapper).toHaveStyle({
      maxWidth: "300px",
      width: "100%",
    });
  });

  test("login success stores token and shows registry view", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    expect(view.queryByText("Navigation")).not.toBeInTheDocument();
    expect(view.getByText("Person")).toBeInTheDocument();
    expect(view.getByText("Collection")).toBeInTheDocument();
    expect(view.getByText("Shop")).toBeInTheDocument();
    expect(view.getByText("Adjustments")).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Sync Now" })).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    expect(view.getByText("administrator (administrator)")).toBeInTheDocument();

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
            username: "administrator",
            role: "administrator",
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
              idNumber: "****87",
              phone: "****67",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    await userEvent.click(view.getByRole("button", { name: "Create" }));
    await userEvent.type(view.getByLabelText("Name"), "Jane");
    await userEvent.type(view.getByLabelText("Surname"), "Doe");
    await userEvent.type(view.getByLabelText("ID Number"), "8001015009087");
    await userEvent.type(view.getByLabelText("Phone"), "0821234567");
    await userEvent.click(view.getByRole("button", { name: "Save Person" }));
    await userEvent.click(view.getByRole("button", { name: "Search" }));
    await userEvent.click(view.getAllByRole("button", { name: "Search" })[1]!);

    await waitFor(() => {
      expect(view.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    });

    expect(view.getByText("ID: ****87")).toBeInTheDocument();
    expect(view.getByText("Phone: ****67")).toBeInTheDocument();
    expect(view.queryByText("8001015009087")).not.toBeInTheDocument();
    expect(view.queryByText("0821234567")).not.toBeInTheDocument();
  }, 20000);

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
            username: "administrator",
            role: "administrator",
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
                idNumber: "****87",
                phone: "****67",
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
              idNumber: "****87",
              phone: "****67",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    });

    await userEvent.click(view.getAllByRole("button", { name: "Edit" })[1]!);
    await userEvent.click(view.getAllByRole("button", { name: "Edit" })[0]!);
    await userEvent.type(view.getByLabelText("Surname"), "Updated");
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
    await userEvent.type(firstView.getByLabelText("Username"), "administrator");
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
            username: "administrator",
            role: "administrator",
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
    await userEvent.type(secondView.getByLabelText("Username"), "administrator");
    await userEvent.type(secondView.getByLabelText("Passcode"), "1234");
    await userEvent.click(secondView.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(secondView.getByText("Person Registry")).toBeInTheDocument();
    });
    await userEvent.click(secondView.getByRole("button", { name: "Create" }));
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
            username: "administrator",
            role: "administrator",
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
              pointsPerKg: 3.2,
            },
            {
              id: "mat-2",
              name: "Glass",
              pointsPerKg: 2.1,
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
            balancePoints: 12.4,
          },
        });
      }
      if (url.includes("/ledger/person-1/entries")) {
        return jsonResponse({
          entries: [
            {
              id: "event-intake-1",
              personId: "person-1",
              deltaPoints: 12.4,
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });
    await userEvent.click(view.getByRole("button", { name: "Log material collection" }));
    await userEvent.type(view.getByLabelText("Weight Kg 1"), "2.9");
    await userEvent.click(view.getByRole("button", { name: "Add Line" }));
    await userEvent.click(view.getByRole("textbox", { name: "Material 2" }));
    await userEvent.click(view.getByRole("option", { name: "Glass (2.1 pts/kg)" }));
    await userEvent.type(view.getByLabelText("Weight Kg 2"), "1.5");

    await userEvent.click(view.getByRole("button", { name: "Record Intake" }));

    await waitFor(() => {
      expect(view.getByText("Balance: 12.4")).toBeInTheDocument();
    });
    expect(view.getByText("intake.recorded | +12.4")).toBeInTheDocument();
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
    expect(body.events[0]?.payload.totalPoints).toBe(12.3);
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
            username: "administrator",
            role: "administrator",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });
    await userEvent.click(view.getByRole("button", { name: "Log material collection" }));

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
            username: "administrator",
            role: "administrator",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });
    await userEvent.click(view.getByRole("button", { name: "Log material collection" }));

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
            username: "administrator",
            role: "administrator",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });
    await userEvent.click(view.getByRole("button", { name: "Log material collection" }));

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
            username: "administrator",
            role: "administrator",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Log material collection" }));

    await waitFor(() => {
      expect(view.getByText("Balance: 12.0")).toBeInTheDocument();
    });
    expect(view.getByText("Source: event-1")).toBeInTheDocument();
  });

  test("inventory adjustment apply posts API request and refreshes inventory summary", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    let capturedApplyBody: unknown = null;
    let inventorySummaryCallCount = 0;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/inventory/adjustments/apply")) {
        if (typeof init?.body === "string") {
          capturedApplyBody = JSON.parse(init.body) as unknown;
        }
        return jsonResponse({ eventId: "event-1" }, 201);
      }
      if (url.includes("/adjustments/requests")) {
        return jsonResponse({ requests: [], nextCursor: null });
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });
    await userEvent.click(view.getByRole("button", { name: "Adjust inventory" }));
    await userEvent.click(view.getAllByLabelText("Batch")[0]!);
    await userEvent.click(await view.findByRole("option", { name: "batch-1 (item-1)" }));

    await userEvent.type(view.getByLabelText("Quantity"), "4");
    await userEvent.type(view.getByLabelText("Reason"), "restock shelf");
    await userEvent.click(view.getByRole("button", { name: "Adjust Inventory" }));

    const body = capturedApplyBody as {
      inventoryBatchId: string;
      fromStatus: string;
      toStatus: string;
      quantity: number;
      reason: string;
    };
    expect(body.inventoryBatchId).toBe("batch-1");
    expect(body.fromStatus).toBe("shop");
    expect(body.toStatus).toBe("damaged");
    expect(body.quantity).toBe(4);
    expect(body.reason).toBe("restock shelf");
  });

  test("inventory adjustment request posts API request for user", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    let capturedInventoryRequestBody: unknown = null;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "user",
            role: "user",
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
      if (url.includes("/inventory/adjustments/requests")) {
        if (typeof init?.body === "string") {
          capturedInventoryRequestBody = JSON.parse(init.body) as unknown;
        }
        return jsonResponse({ requestEventId: "evt-1" }, 201);
      }
      if (url.includes("/adjustments/requests")) {
        return jsonResponse({ requests: [], nextCursor: null });
      }
      if (url.includes("/sync/conflicts")) {
        return jsonResponse({ conflicts: [], nextCursor: null });
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

    await userEvent.type(view.getByLabelText("Username"), "user");
    await userEvent.type(view.getByLabelText("Passcode"), "9999");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    await userEvent.click(view.getByRole("button", { name: "Request inventory adjustment" }));
    await userEvent.type(view.getByLabelText("Quantity"), "1");
    await userEvent.type(view.getByLabelText("Reason"), "damage");
    await userEvent.click(view.getByRole("button", { name: "Submit Adjustment Request" }));

    const body = capturedInventoryRequestBody as {
      inventoryBatchId: string;
      requestedStatus: string;
      quantity: number;
      reason: string;
    };
    expect(body.inventoryBatchId).toBe("batch-1");
    expect(body.requestedStatus).toBe("spoiled");
    expect(body.quantity).toBe(1);
    expect(body.reason).toBe("damage");
  });

  test("points adjustment request posts API request for user", async () => {
    stubResizeObserver();
    const queue = createEventQueue(createMemoryEventQueueStore());
    const syncStateStore = createMemorySyncStateStore();
    let capturedPointsRequestBody: unknown = null;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "user",
            role: "user",
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
      if (url.includes("/points/adjustments/requests")) {
        if (typeof init?.body === "string") {
          capturedPointsRequestBody = JSON.parse(init.body) as unknown;
        }
        return jsonResponse({ requestEventId: "evt-2" }, 201);
      }
      if (url.includes("/adjustments/requests")) {
        return jsonResponse({ requests: [], nextCursor: null });
      }
      if (url.includes("/ledger/person-1/balance")) {
        return jsonResponse({ balance: { personId: "person-1", balancePoints: 10 } });
      }
      if (url.includes("/ledger/person-1/entries")) {
        return jsonResponse({ entries: [] });
      }
      if (url.includes("/sync/push")) {
        return jsonResponse({
          acknowledgements: [],
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

    await userEvent.type(view.getByLabelText("Username"), "user");
    await userEvent.type(view.getByLabelText("Passcode"), "9999");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });

    await userEvent.click(view.getByRole("button", { name: "Request points adjustment" }));
    await userEvent.type(view.getByLabelText("Adjustment Points"), "2.5");
    await userEvent.type(view.getByLabelText("Adjustment Reason"), "manual correction");
    await userEvent.click(view.getByRole("button", { name: "Submit Points Adjustment Request" }));

    const body = capturedPointsRequestBody as {
      personId: string;
      deltaPoints: number;
      reason: string;
    };
    expect(body.personId).toBe("person-1");
    expect(body.deltaPoints).toBe(2.5);
    expect(body.reason).toBe("manual correction");
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
            username: "administrator",
            role: "administrator",
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
        return jsonResponse({ materials: [{ id: "mat-1", name: "PET", pointsPerKg: 3.2 }] });
      }
      if (url.includes("/items")) {
        return jsonResponse({ items: [{ id: "item-1", name: "Soap", pointsPrice: 10.5 }] });
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
            balancePoints: 20.4,
          },
        });
      }
      if (url.includes("/ledger/person-1/entries")) {
        return jsonResponse({
          entries: [
            {
              id: "event-sale-1",
              personId: "person-1",
              deltaPoints: -31.5,
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Log sale" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Record Sale" })).toBeInTheDocument();
    });
    await userEvent.type(view.getByLabelText("Quantity 1"), "3");
    await userEvent.click(view.getByRole("button", { name: "Record Sale" }));

    await waitFor(() => {
      expect(capturedPushBody).not.toBeNull();
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
    expect(pushBody.events[0]?.payload.totalPoints).toBe(31.5);
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
            username: "administrator",
            role: "administrator",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Log sale" }));

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

  test("procurement panel is hidden for non-administrator", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-2",
            username: "user",
            role: "user",
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

    await userEvent.type(view.getByLabelText("Username"), "user");
    await userEvent.type(view.getByLabelText("Passcode"), "9999");
    await userEvent.click(view.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(view.getByText("Person Registry")).toBeInTheDocument();
    });
    expect(view.queryByRole("heading", { name: "Record Procurement" })).not.toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "Record Expense" })).not.toBeInTheDocument();
    expect(
      view.queryByRole("heading", { name: "Inventory Status Change" }),
    ).not.toBeInTheDocument();
    expect(
      view.queryByRole("heading", { name: "Materials Collected Report" }),
    ).not.toBeInTheDocument();
    expect(
      view.queryByRole("heading", { name: "Points Liability Report" }),
    ).not.toBeInTheDocument();
    expect(
      view.queryByRole("heading", { name: "Inventory Status Report" }),
    ).not.toBeInTheDocument();
    expect(
      view.queryByRole("heading", { name: "Inventory Status Change Log" }),
    ).not.toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "Sales Report" })).not.toBeInTheDocument();
    expect(
      view.queryByRole("heading", { name: "Integrity and Reconciliation" }),
    ).not.toBeInTheDocument();
  });

  test("materials report panel loads for manager and runs default request", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({ people: [] });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [{ id: "mat-1", name: "PET", pointsPerKg: 3 }],
        });
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Materials Collected Report" })).toBeInTheDocument();
    });
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/reports/materials-collected")),
    ).toBe(false);
    await openManagerPanel(view, "Open Materials Collected Report");
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/reports/materials-collected"),
        ),
      ).toBe(true);
    });
    expect(view.getByText("No materials report rows found.")).toBeInTheDocument();
  }, 20000);

  test("manager login does not automatically request report or reconciliation endpoints", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Materials Collected Report" })).toBeInTheDocument();
    });

    const requestedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(requestedUrls.some((url) => url.includes("/reports/"))).toBe(false);
    expect(requestedUrls.some((url) => url.includes("/sync/reconciliation/report"))).toBe(false);
  }, 20000);

  test("reopening an already loaded manager panel does not refetch until rerun", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Materials Collected Report" })).toBeInTheDocument();
    });

    await openManagerPanel(view, "Open Materials Collected Report");
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter((call) =>
          String(call[0]).includes("/reports/materials-collected"),
        ).length,
      ).toBe(1);
    });

    await userEvent.click(view.getByRole("button", { name: "Hide Materials Collected Report" }));
    await openManagerPanel(view, "Open Materials Collected Report");

    expect(
      fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("/reports/materials-collected"),
      ).length,
    ).toBe(1);
  }, 20000);

  test("materials report filtered run sends query", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
          },
          token: "token-1",
        });
      }
      if (url.includes("/people")) {
        return jsonResponse({ people: [] });
      }
      if (url.includes("/materials")) {
        return jsonResponse({
          materials: [{ id: "mat-1", name: "PET", pointsPerKg: 3 }],
        });
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
      if (
        url.includes(
          "/reports/materials-collected?fromDate=2026-03-01&toDate=2026-03-09&locationText=Village+A",
        )
      ) {
        return jsonResponse({
          rows: [
            {
              day: "2026-03-08",
              materialTypeId: "mat-1",
              materialName: "PET",
              locationText: "Village A",
              totalWeightKg: 12.5,
              totalPoints: 37,
            },
          ],
          appliedFilters: {
            fromDate: "2026-03-01",
            toDate: "2026-03-09",
            locationText: "Village A",
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Materials Collected Report" })).toBeInTheDocument();
    });
    await openManagerPanel(view, "Open Materials Collected Report");

    await userEvent.clear(view.getByLabelText("From Date"));
    await userEvent.type(view.getByLabelText("From Date"), "2026-03-01");
    await userEvent.clear(view.getByLabelText("To Date"));
    await userEvent.type(view.getByLabelText("To Date"), "2026-03-09");
    await userEvent.type(view.getByLabelText("Location"), "Village A");
    await userEvent.click(view.getByRole("button", { name: "Run Report" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes(
            "/reports/materials-collected?fromDate=2026-03-01&toDate=2026-03-09&locationText=Village+A",
          ),
        ),
      ).toBe(true);
    });
  }, 20000);

  test("points liability report panel loads for manager and runs default request", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [
            {
              personId: "person-1",
              name: "Jane",
              surname: "Doe",
              balancePoints: 38.7,
            },
          ],
          summary: {
            totalOutstandingPoints: 38.7,
            personCount: 1,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Points Liability Report" })).toBeInTheDocument();
    });
    await openManagerPanel(view, "Open Points Liability Report");
    expect(view.getByText("Total outstanding: 38.7")).toBeInTheDocument();
    expect(view.getByText("People with balances: 1")).toBeInTheDocument();
    expect(view.getByText("Jane Doe")).toBeInTheDocument();
    expect(view.getByText("Balance: 38.7")).toBeInTheDocument();
  }, 20000);

  test("points liability report filtered run sends search query and shows empty state", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability?search=smith")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: "smith",
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Points Liability Report" })).toBeInTheDocument();
    });
    await openManagerPanel(view, "Open Points Liability Report");

    await userEvent.type(view.getByLabelText("Person Search"), "smith");
    await userEvent.click(view.getByRole("button", { name: "Run Report" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/reports/points-liability?search=smith"),
        ),
      ).toBe(true);
    });
    expect(view.getByText("Applied search: smith")).toBeInTheDocument();
    expect(view.getByText("No points liability rows found.")).toBeInTheDocument();
  }, 20000);

  test("inventory status report panel loads for manager and shows summary plus detail", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 6, totalCostValue: 25.5 },
            { status: "shop", totalQuantity: 3, totalCostValue: 12.75 },
            { status: "sold", totalQuantity: 1, totalCostValue: 4.25 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [
            {
              status: "storage",
              itemId: "item-1",
              itemName: "Soap",
              quantity: 6,
              unitCost: 4.25,
              totalCostValue: 25.5,
            },
          ],
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Inventory Status Report" })).toBeInTheDocument();
    });
    await openManagerPanel(view, "Open Inventory Status Report");
    expect(view.getByText("storage: Qty 6 | Cost 25.50")).toBeInTheDocument();
    expect(view.getByText("spoiled: Qty 0 | Cost 0.00")).toBeInTheDocument();
    expect(view.getByText("storage | Soap")).toBeInTheDocument();
    expect(view.getByText("Qty: 6 | Unit cost: 4.25 | Cost: 25.50")).toBeInTheDocument();
  }, 20000);

  test("inventory status report shows zero summaries and empty detail state", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0, totalCostValue: 0 },
            { status: "shop", totalQuantity: 0, totalCostValue: 0 },
            { status: "sold", totalQuantity: 0, totalCostValue: 0 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [],
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Inventory Status Report" })).toBeInTheDocument();
    });
    await openManagerPanel(view, "Open Inventory Status Report");
    expect(view.getByText("missing: Qty 0 | Cost 0.00")).toBeInTheDocument();
    expect(view.getByText("No inventory report rows found.")).toBeInTheDocument();
  }, 20000);

  test("inventory status log report panel loads for manager and runs default request", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status-log")) {
        return jsonResponse({
          rows: [
            {
              eventId: "evt-1",
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
          ],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            fromStatus: null,
            toStatus: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0, totalCostValue: 0 },
            { status: "shop", totalQuantity: 0, totalCostValue: 0 },
            { status: "sold", totalQuantity: 0, totalCostValue: 0 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [],
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(
        view.getByRole("heading", { name: "Inventory Status Change Log" }),
      ).toBeInTheDocument();
    });
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/reports/inventory-status-log"),
      ),
    ).toBe(false);
    await openManagerPanel(view, "Open Inventory Status Change Log");
    expect(view.getAllByText("Applied: 2026-02-08 to 2026-03-09").length).toBeGreaterThan(0);
    expect(view.getByText("2026-03-08 10:00 | batch-1 | Soap")).toBeInTheDocument();
    expect(view.getByText("storage -> shop | Qty 4 | Reason: Move to shop")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/reports/inventory-status-log"),
      ),
    ).toBe(true);
  }, 20000);

  test("inventory status log report filtered run sends query and shows empty state", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      if (
        url.includes(
          "/reports/inventory-status-log?fromDate=2026-03-01&toDate=2026-03-09&fromStatus=storage&toStatus=shop",
        )
      ) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-03-01",
            toDate: "2026-03-09",
            fromStatus: "storage",
            toStatus: "shop",
          },
        });
      }
      if (url.includes("/reports/inventory-status-log")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            fromStatus: null,
            toStatus: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0, totalCostValue: 0 },
            { status: "shop", totalQuantity: 0, totalCostValue: 0 },
            { status: "sold", totalQuantity: 0, totalCostValue: 0 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [],
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(
        view.getByRole("heading", { name: "Inventory Status Change Log" }),
      ).toBeInTheDocument();
    });
    await openManagerPanel(view, "Open Inventory Status Change Log");

    await userEvent.clear(view.getByLabelText("Log From Date"));
    await userEvent.type(view.getByLabelText("Log From Date"), "2026-03-01");
    await userEvent.clear(view.getByLabelText("Log To Date"));
    await userEvent.type(view.getByLabelText("Log To Date"), "2026-03-09");
    await userEvent.click(view.getByRole("textbox", { name: "From Status Filter" }));
    await userEvent.click(view.getByRole("option", { name: "storage" }));
    await userEvent.click(view.getByRole("textbox", { name: "To Status Filter" }));
    await userEvent.click(view.getByRole("option", { name: "shop" }));
    await userEvent.click(view.getByRole("button", { name: "Run Report" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes(
            "/reports/inventory-status-log?fromDate=2026-03-01&toDate=2026-03-09&fromStatus=storage&toStatus=shop",
          ),
        ),
      ).toBe(true);
    });
    expect(view.getByText("Applied: 2026-03-01 to 2026-03-09")).toBeInTheDocument();
    expect(view.getByText("No inventory status changes found.")).toBeInTheDocument();
  }, 20000);

  test("sales report panel loads for manager and runs default request", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
        return jsonResponse({ items: [{ id: "item-1", name: "Soap", pointsPrice: 10.5 }] });
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status-log")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            fromStatus: null,
            toStatus: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0, totalCostValue: 0 },
            { status: "shop", totalQuantity: 0, totalCostValue: 0 },
            { status: "sold", totalQuantity: 0, totalCostValue: 0 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [],
        });
      }
      if (url.includes("/reports/sales")) {
        return jsonResponse({
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
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            itemId: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Sales Report" })).toBeInTheDocument();
    });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/reports/sales"))).toBe(
      false,
    );
    await openManagerPanel(view, "Open Sales Report");
    expect(view.getAllByText("Applied: 2026-02-08 to 2026-03-09").length).toBeGreaterThan(0);
    expect(view.getByText("Total quantity: 5")).toBeInTheDocument();
    expect(view.getByText("Total points: 52.5")).toBeInTheDocument();
    expect(view.getByText("Sale events: 2")).toBeInTheDocument();
    expect(view.getByText("2026-03-08 | Village A | Soap")).toBeInTheDocument();
    expect(view.getByText("Qty: 5 | Points: 52.5 | Sales: 2")).toBeInTheDocument();
  }, 20000);

  test("sales report filtered run sends query and shows empty state", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
        return jsonResponse({ items: [{ id: "item-1", name: "Soap", pointsPrice: 10.5 }] });
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status-log")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            fromStatus: null,
            toStatus: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0, totalCostValue: 0 },
            { status: "shop", totalQuantity: 0, totalCostValue: 0 },
            { status: "sold", totalQuantity: 0, totalCostValue: 0 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [],
        });
      }
      if (
        url.includes(
          "/reports/sales?fromDate=2026-03-01&toDate=2026-03-09&locationText=Village+A&itemId=item-1",
        )
      ) {
        return jsonResponse({
          rows: [],
          summary: {
            totalQuantity: 0,
            totalPoints: 0,
            saleCount: 0,
          },
          appliedFilters: {
            fromDate: "2026-03-01",
            toDate: "2026-03-09",
            locationText: "Village A",
            itemId: "item-1",
          },
        });
      }
      if (url.includes("/reports/sales")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalQuantity: 0,
            totalPoints: 0,
            saleCount: 0,
          },
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            itemId: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Sales Report" })).toBeInTheDocument();
    });
    await openManagerPanel(view, "Open Sales Report");

    await userEvent.clear(view.getByLabelText("Sales From Date"));
    await userEvent.type(view.getByLabelText("Sales From Date"), "2026-03-01");
    await userEvent.clear(view.getByLabelText("Sales To Date"));
    await userEvent.type(view.getByLabelText("Sales To Date"), "2026-03-09");
    await userEvent.click(view.getByRole("textbox", { name: "Sales Item" }));
    await userEvent.click(view.getByRole("option", { name: "Soap" }));
    await userEvent.type(view.getByLabelText("Sales Location"), "Village A");
    await userEvent.click(view.getByRole("button", { name: "Run Report" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes(
            "/reports/sales?fromDate=2026-03-01&toDate=2026-03-09&locationText=Village+A&itemId=item-1",
          ),
        ),
      ).toBe(true);
    });
    expect(view.getByText("Applied: 2026-03-01 to 2026-03-09")).toBeInTheDocument();
    expect(view.getByText("No sales report rows found.")).toBeInTheDocument();
  }, 20000);

  test("cashflow report panel loads for manager and runs default request", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
        return jsonResponse({ items: [{ id: "item-1", name: "Soap", pointsPrice: 10.5 }] });
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status-log")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            fromStatus: null,
            toStatus: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0, totalCostValue: 0 },
            { status: "shop", totalQuantity: 0, totalCostValue: 0 },
            { status: "sold", totalQuantity: 0, totalCostValue: 0 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [],
        });
      }
      if (url.includes("/reports/sales")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalQuantity: 0,
            totalPoints: 0,
            saleCount: 0,
          },
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            itemId: null,
          },
        });
      }
      if (url.includes("/reports/cashflow")) {
        return jsonResponse({
          rows: [
            {
              day: "2026-03-08",
              salesPointsValue: 52.5,
              expenseCashTotal: 18.5,
              netCashflow: 34,
              saleCount: 2,
              expenseCount: 1,
            },
          ],
          summary: {
            totalSalesPointsValue: 52.5,
            totalExpenseCash: 18.5,
            netCashflow: 34,
            saleCount: 2,
            expenseCount: 1,
          },
          expenseCategories: [
            {
              category: "Fuel",
              totalCashAmount: 18.5,
              expenseCount: 1,
            },
          ],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Cashflow Report" })).toBeInTheDocument();
    });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/reports/cashflow"))).toBe(
      false,
    );
    await openManagerPanel(view, "Open Cashflow Report");
    expect(view.getAllByText("Applied: 2026-02-08 to 2026-03-09").length).toBeGreaterThan(0);
    expect(view.getByText("Sales value: 52.5")).toBeInTheDocument();
    expect(view.getByText("Expenses: 18.50")).toBeInTheDocument();
    expect(view.getByText("Net: 34.00")).toBeInTheDocument();
    expect(view.getByText("2026-03-08")).toBeInTheDocument();
    expect(view.getByText("Fuel")).toBeInTheDocument();
    expect(view.getByText("Expense total: 18.50 | Expense events: 1")).toBeInTheDocument();
  }, 20000);

  test("cashflow report filtered run sends query and shows empty states", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status-log")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            fromStatus: null,
            toStatus: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0, totalCostValue: 0 },
            { status: "shop", totalQuantity: 0, totalCostValue: 0 },
            { status: "sold", totalQuantity: 0, totalCostValue: 0 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [],
        });
      }
      if (url.includes("/reports/sales")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalQuantity: 0,
            totalPoints: 0,
            saleCount: 0,
          },
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            itemId: null,
          },
        });
      }
      if (
        url.includes(
          "/reports/cashflow?fromDate=2026-03-01&toDate=2026-03-09&locationText=Village+A",
        )
      ) {
        return jsonResponse({
          rows: [],
          summary: {
            totalSalesPointsValue: 0,
            totalExpenseCash: 0,
            netCashflow: 0,
            saleCount: 0,
            expenseCount: 0,
          },
          expenseCategories: [],
          appliedFilters: {
            fromDate: "2026-03-01",
            toDate: "2026-03-09",
            locationText: "Village A",
          },
        });
      }
      if (url.includes("/reports/cashflow")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalSalesPointsValue: 0,
            totalExpenseCash: 0,
            netCashflow: 0,
            saleCount: 0,
            expenseCount: 0,
          },
          expenseCategories: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Cashflow Report" })).toBeInTheDocument();
    });
    await openManagerPanel(view, "Open Cashflow Report");

    await userEvent.clear(view.getByLabelText("Cashflow From Date"));
    await userEvent.type(view.getByLabelText("Cashflow From Date"), "2026-03-01");
    await userEvent.clear(view.getByLabelText("Cashflow To Date"));
    await userEvent.type(view.getByLabelText("Cashflow To Date"), "2026-03-09");
    await userEvent.type(view.getByLabelText("Cashflow Location"), "Village A");
    await userEvent.click(view.getByRole("button", { name: "Run Report" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes(
            "/reports/cashflow?fromDate=2026-03-01&toDate=2026-03-09&locationText=Village+A",
          ),
        ),
      ).toBe(true);
    });
    expect(view.getByText("Applied: 2026-03-01 to 2026-03-09")).toBeInTheDocument();
    expect(view.getByText("No cashflow report rows found.")).toBeInTheDocument();
    expect(view.getByText("No expense categories found.")).toBeInTheDocument();
  }, 20000);

  test("reconciliation panel loads for manager and requires repair notes", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/sync/reconciliation/report")) {
        return jsonResponse({
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
                reasonTemplate: "Reconciliation correction for points balance mismatch",
              },
            },
          ],
          nextCursor: null,
        });
      }
      if (url.includes("/sync/reconciliation/issues/") && init?.method === "POST") {
        return jsonResponse({
          issueId: "POINTS_BALANCE_MISMATCH:person-1",
          repairKind: "points_adjustment",
          repairEventId: "repair-event-1",
        });
      }
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: { totalOutstandingPoints: 0, personCount: 0 },
          appliedFilters: { search: null },
        });
      }
      if (url.includes("/reports/inventory-status-log")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            fromStatus: null,
            toStatus: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0, totalCostValue: 0 },
            { status: "shop", totalQuantity: 0, totalCostValue: 0 },
            { status: "sold", totalQuantity: 0, totalCostValue: 0 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [],
        });
      }
      if (url.includes("/reports/sales")) {
        return jsonResponse({
          rows: [],
          summary: { totalQuantity: 0, totalPoints: 0, saleCount: 0 },
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            itemId: null,
          },
        });
      }
      if (url.includes("/reports/cashflow")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalSalesPointsValue: 0,
            totalExpenseCash: 0,
            netCashflow: 0,
            saleCount: 0,
            expenseCount: 0,
          },
          expenseCategories: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
          },
        });
      }
      if (url.includes("/sync/pull")) {
        return jsonResponse({ events: [], nextCursor: null });
      }
      if (url.includes("/sync/status")) {
        return jsonResponse({
          latestCursor: null,
          projectionRefreshedAt: null,
          projectionCursor: null,
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(
        view.getByRole("heading", { name: "Integrity and Reconciliation" }),
      ).toBeInTheDocument();
    });
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/sync/reconciliation/report")),
    ).toBe(false);
    await openManagerPanel(view, "Open Integrity and Reconciliation");

    expect(view.getByText("POINTS_BALANCE_MISMATCH")).toBeInTheDocument();
    await userEvent.click(view.getByRole("button", { name: "Apply Suggested Fix" }));
    await userEvent.click(view.getByRole("button", { name: "Confirm Repair" }));
    expect(view.getByText("Repair notes are required")).toBeInTheDocument();

    await userEvent.type(view.getByLabelText("Manager Notes"), "checked ledger");
    await userEvent.click(view.getByRole("button", { name: "Confirm Repair" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes(
            "/sync/reconciliation/issues/POINTS_BALANCE_MISMATCH%3Aperson-1/repair",
          ),
        ),
      ).toBe(true);
    });
  }, 20000);

  test("cashflow report export downloads CSV", async () => {
    stubResizeObserver();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return jsonResponse({
          user: {
            id: "user-1",
            username: "administrator",
            role: "administrator",
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
      if (url.includes("/reports/materials-collected")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            materialTypeId: null,
          },
        });
      }
      if (url.includes("/reports/points-liability")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalOutstandingPoints: 0,
            personCount: 0,
          },
          appliedFilters: {
            search: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status-log")) {
        return jsonResponse({
          rows: [],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            fromStatus: null,
            toStatus: null,
          },
        });
      }
      if (url.includes("/reports/inventory-status")) {
        return jsonResponse({
          summary: [
            { status: "storage", totalQuantity: 0, totalCostValue: 0 },
            { status: "shop", totalQuantity: 0, totalCostValue: 0 },
            { status: "sold", totalQuantity: 0, totalCostValue: 0 },
            { status: "spoiled", totalQuantity: 0, totalCostValue: 0 },
            { status: "damaged", totalQuantity: 0, totalCostValue: 0 },
            { status: "missing", totalQuantity: 0, totalCostValue: 0 },
          ],
          rows: [],
        });
      }
      if (url.includes("/reports/sales")) {
        return jsonResponse({
          rows: [],
          summary: {
            totalQuantity: 0,
            totalPoints: 0,
            saleCount: 0,
          },
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
            itemId: null,
          },
        });
      }
      if (url.includes("/reports/cashflow")) {
        return jsonResponse({
          rows: [
            {
              day: "2026-03-08",
              salesPointsValue: 52.5,
              expenseCashTotal: 18.5,
              netCashflow: 34,
              saleCount: 2,
              expenseCount: 1,
            },
          ],
          summary: {
            totalSalesPointsValue: 52.5,
            totalExpenseCash: 18.5,
            netCashflow: 34,
            saleCount: 2,
            expenseCount: 1,
          },
          expenseCategories: [
            {
              category: "Fuel",
              totalCashAmount: 18.5,
              expenseCount: 1,
            },
          ],
          appliedFilters: {
            fromDate: "2026-02-08",
            toDate: "2026-03-09",
            locationText: null,
          },
        });
      }
      return jsonResponse({ error: "NOT_EXPECTED" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    const createObjectUrl = vi.fn<(blob: Blob) => string>().mockReturnValue("blob:cashflow");
    const revokeObjectUrl = vi.fn<(url: string) => void>();
    const clickSpy = vi
      .spyOn(globalThis.HTMLAnchorElement.prototype, "click")
      .mockImplementation((): void => {
        return;
      });
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    const view = render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Reports" }));

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "Cashflow Report" })).toBeInTheDocument();
    });
    await openManagerPanel(view, "Open Cashflow Report");

    await userEvent.click(view.getByRole("button", { name: "Export CSV" }));

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:cashflow");
  }, 20000);

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
            username: "administrator",
            role: "administrator",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Log sale" }));

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
  }, 20000);

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
            username: "administrator",
            role: "administrator",
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

    await userEvent.type(view.getByLabelText("Username"), "administrator");
    await userEvent.type(view.getByLabelText("Passcode"), "1234");
    await userEvent.click(view.getByRole("button", { name: "Login" }));
    await userEvent.click(view.getByRole("button", { name: "Log sale" }));
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
