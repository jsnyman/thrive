import type { Event } from "../../../../packages/shared/src/domain/events";
import {
  applyAcceptedIncomingEvent,
  createMergeState,
  decodeSyncCursor,
  evaluateMergeDecision,
  type MergeReplayEvent,
} from "./sync-merge-policy";

const encodeCursor = (recordedAt: string, eventId: string): string =>
  Buffer.from(
    JSON.stringify({
      recordedAt,
      eventId,
    }),
    "utf8",
  ).toString("base64url");

const buildEvent = (
  overrides: Partial<Event> & Pick<Event, "eventType" | "payload" | "eventId">,
): Event =>
  ({
    eventId: overrides.eventId,
    eventType: overrides.eventType,
    occurredAt: overrides.occurredAt ?? "2026-03-07T10:00:00.000Z",
    recordedAt: overrides.recordedAt ?? null,
    actorUserId: overrides.actorUserId ?? "2772c203-5df5-4967-9341-09e391f4cb90",
    deviceId: overrides.deviceId ?? "device-a",
    locationText: overrides.locationText ?? null,
    schemaVersion: overrides.schemaVersion ?? 1,
    correlationId: overrides.correlationId ?? null,
    causationId: overrides.causationId ?? null,
    payload: overrides.payload,
  }) as Event;

const replayEvent = (event: Event, recordedAt: string): MergeReplayEvent => ({
  event,
  recordedAt,
});

describe("sync merge policy", () => {
  test("returns duplicate when event id already exists", () => {
    const existing = buildEvent({
      eventId: "event-existing",
      eventType: "expense.recorded",
      payload: {
        category: "Fuel",
        cashAmount: 50,
      },
    });
    const state = createMergeState([replayEvent(existing, "2026-03-07T10:00:01.000Z")]);

    const decision = evaluateMergeDecision(state, existing, null);

    expect(decision.status).toBe("duplicate");
  });

  test("rejects stale profile update when entity changed after client cursor", () => {
    const created = buildEvent({
      eventId: "event-person-created",
      eventType: "person.created",
      payload: {
        personId: "person-1",
        name: "Amy",
        surname: "Zulu",
      },
    });
    const updated = buildEvent({
      eventId: "event-person-updated",
      eventType: "person.profile_updated",
      payload: {
        personId: "person-1",
        updates: {
          name: "Amelia",
        },
      },
    });
    const state = createMergeState([
      replayEvent(created, "2026-03-07T10:00:01.000Z"),
      replayEvent(updated, "2026-03-07T10:00:05.000Z"),
    ]);
    const cursor = decodeSyncCursor(encodeCursor("2026-03-07T10:00:03.000Z", "event-old-cursor"));

    const incoming = buildEvent({
      eventId: "event-client-update",
      eventType: "person.profile_updated",
      payload: {
        personId: "person-1",
        updates: {
          surname: "Khumalo",
        },
      },
    });

    const decision = evaluateMergeDecision(state, incoming, cursor);

    expect(decision).toMatchObject({
      status: "rejected",
      reason: "STALE_CURSOR_CONFLICT",
    });
  });

  test("rejects sale when resulting points would be negative", () => {
    const created = buildEvent({
      eventId: "event-person-created",
      eventType: "person.created",
      payload: {
        personId: "person-1",
        name: "Amy",
        surname: "Zulu",
      },
    });
    const item = buildEvent({
      eventId: "event-item-created",
      eventType: "item.created",
      payload: {
        itemId: "item-1",
        name: "Soap",
        pointsPrice: 10,
      },
    });
    const intake = buildEvent({
      eventId: "event-intake",
      eventType: "intake.recorded",
      payload: {
        personId: "person-1",
        lines: [],
        totalPoints: 5,
      },
    });
    const state = createMergeState([
      replayEvent(created, "2026-03-07T10:00:01.000Z"),
      replayEvent(item, "2026-03-07T10:00:02.000Z"),
      replayEvent(intake, "2026-03-07T10:00:03.000Z"),
    ]);

    const sale = buildEvent({
      eventId: "event-sale",
      eventType: "sale.recorded",
      payload: {
        personId: "person-1",
        lines: [
          {
            itemId: "item-1",
            inventoryBatchId: null,
            quantity: 1,
            pointsPrice: 10,
            lineTotalPoints: 10,
          },
        ],
        totalPoints: 10,
      },
    });

    const decision = evaluateMergeDecision(state, sale, null);

    expect(decision).toMatchObject({
      status: "rejected",
      reason: "INSUFFICIENT_POINTS",
    });
  });

  test("rejects inventory status change on underflow", () => {
    const item = buildEvent({
      eventId: "event-item-created",
      eventType: "item.created",
      payload: {
        itemId: "item-1",
        name: "Soap",
        pointsPrice: 10,
      },
    });
    const procurement = buildEvent({
      eventId: "event-procurement",
      eventType: "procurement.recorded",
      payload: {
        supplierName: null,
        tripDistanceKm: null,
        cashTotal: 10,
        lines: [
          {
            itemId: "item-1",
            inventoryBatchId: "batch-1",
            quantity: 2,
            unitCost: 5,
            lineTotalCost: 10,
          },
        ],
      },
    });
    const state = createMergeState([
      replayEvent(item, "2026-03-07T10:00:01.000Z"),
      replayEvent(procurement, "2026-03-07T10:00:02.000Z"),
    ]);

    const change = buildEvent({
      eventId: "event-status-change",
      eventType: "inventory.status_changed",
      payload: {
        inventoryBatchId: "batch-1",
        fromStatus: "shop",
        toStatus: "sold",
        quantity: 1,
        reason: null,
        notes: null,
      },
    });

    const decision = evaluateMergeDecision(state, change, null);

    expect(decision).toMatchObject({
      status: "rejected",
      reason: "INVENTORY_UNDERFLOW",
    });
  });

  test("rejects adjustment apply when request id is missing", () => {
    const person = buildEvent({
      eventId: "event-person",
      eventType: "person.created",
      payload: {
        personId: "person-1",
        name: "Amy",
        surname: "Zulu",
      },
    });
    const state = createMergeState([replayEvent(person, "2026-03-07T10:00:01.000Z")]);

    const adjustment = buildEvent({
      eventId: "event-points-adjust",
      eventType: "points.adjustment_applied",
      payload: {
        requestEventId: "missing-request",
        personId: "person-1",
        deltaPoints: 5,
        reason: "manual",
      },
    });

    const decision = evaluateMergeDecision(state, adjustment, null);

    expect(decision).toMatchObject({
      status: "rejected",
      reason: "REQUEST_NOT_FOUND",
    });
  });

  test("rejects conflict resolution when conflict id does not exist", () => {
    const state = createMergeState([]);
    const resolution = buildEvent({
      eventId: "event-conflict-resolution",
      eventType: "conflict.resolved",
      payload: {
        conflictId: "conflict-1",
        resolution: "accepted",
        notes: "resolved",
      },
    });

    const decision = evaluateMergeDecision(state, resolution, null);

    expect(decision).toMatchObject({
      status: "rejected",
      reason: "CONFLICT_NOT_FOUND",
    });
  });

  test("accepts create then update in same incoming batch", () => {
    const state = createMergeState([]);
    const create = buildEvent({
      eventId: "event-create",
      eventType: "person.created",
      payload: {
        personId: "person-1",
        name: "Amy",
        surname: "Zulu",
      },
    });
    const update = buildEvent({
      eventId: "event-update",
      eventType: "person.profile_updated",
      payload: {
        personId: "person-1",
        updates: {
          surname: "Khumalo",
        },
      },
    });

    const first = evaluateMergeDecision(state, create, null);
    expect(first.status).toBe("accepted");
    applyAcceptedIncomingEvent(state, create);

    const second = evaluateMergeDecision(state, update, null);
    expect(second.status).toBe("accepted");
  });
});
