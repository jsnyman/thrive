import { describe, expect, test } from "vitest";
import { validateEvent, validateEventEnvelope, validateEventPayload } from "./validation";

describe("validateEventPayload", () => {
  test("accepts valid intake payload with floor-to-tenths points", () => {
    const result = validateEventPayload("intake.recorded", {
      personId: "person-1",
      lines: [
        {
          materialTypeId: "mat-1",
          weightKg: 2.5,
          pointsPerKg: 3,
          pointsAwarded: 7.5,
        },
      ],
      totalPoints: 7.5,
    });

    expect(result.ok).toBe(true);
  });

  test("rejects intake payload when points are not floored to tenths", () => {
    const result = validateEventPayload("intake.recorded", {
      personId: "person-1",
      lines: [
        {
          materialTypeId: "mat-1",
          weightKg: 2.59,
          pointsPerKg: 3,
          pointsAwarded: 7.8,
        },
      ],
      totalPoints: 7.8,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(result.issues.some((issue) => issue.path.includes("pointsAwarded"))).toBe(true);
  });

  test("rejects point values with more than one decimal place", () => {
    const result = validateEventPayload("item.created", {
      itemId: "item-1",
      name: "Soap",
      pointsPrice: 10.25,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(result.issues.some((issue) => issue.path.includes("pointsPrice"))).toBe(true);
  });

  test("accepts valid sale payload with tenths totals", () => {
    const result = validateEventPayload("sale.recorded", {
      personId: "person-1",
      lines: [
        {
          itemId: "item-1",
          inventoryBatchId: "batch-1",
          quantity: 2,
          pointsPrice: 10.5,
          lineTotalPoints: 21.0,
        },
      ],
      totalPoints: 21.0,
    });

    expect(result.ok).toBe(true);
  });

  test("rejects sale payload when line and total points do not match computed values", () => {
    const result = validateEventPayload("sale.recorded", {
      personId: "person-1",
      lines: [
        {
          itemId: "item-1",
          inventoryBatchId: "batch-1",
          quantity: 2,
          pointsPrice: 10.5,
          lineTotalPoints: 20.0,
        },
      ],
      totalPoints: 19.0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(result.issues.some((issue) => issue.path === "payload.lines[0].lineTotalPoints")).toBe(
      true,
    );
    expect(result.issues.some((issue) => issue.path === "payload.totalPoints")).toBe(true);
  });

  test("rejects person profile update with empty updates object", () => {
    const result = validateEventPayload("person.profile_updated", {
      personId: "person-1",
      updates: {},
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(result.issues).toContainEqual({
      path: "payload.updates",
      message: "Expected at least one field to update",
    });
  });

  test("rejects invalid inventory adjustment requested payload", () => {
    const result = validateEventPayload("inventory.adjustment_requested", {
      inventoryBatchId: "batch-1",
      requestedStatus: "storage",
      quantity: 0,
      reason: "",
      notes: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(result.issues.some((issue) => issue.path === "payload.requestedStatus")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "payload.quantity")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "payload.reason")).toBe(true);
  });

  test("rejects points adjustment payload when delta is zero", () => {
    const result = validateEventPayload("points.adjustment_applied", {
      requestEventId: "req-1",
      personId: "person-1",
      deltaPoints: 0.0,
      reason: "noop",
      notes: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(result.issues).toContainEqual({
      path: "payload.deltaPoints",
      message: "Expected deltaPoints to be non-zero",
    });
  });

  test("rejects legacy staff roles in staff user events", () => {
    const result = validateEventPayload("staff_user.created", {
      userId: "user-1",
      username: "legacy",
      role: "manager",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(result.issues).toContainEqual({
      path: "payload.role",
      message: "Expected staff role",
    });
  });

  test("rejects procurement payload when line totals and cash total do not add up", () => {
    const result = validateEventPayload("procurement.recorded", {
      supplierName: "Supplier A",
      tripDistanceKm: 15,
      cashTotal: 20,
      lines: [
        {
          itemId: "item-1",
          inventoryBatchId: "batch-1",
          quantity: 2,
          unitCost: 4,
          lineTotalCost: 9,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(result.issues.some((issue) => issue.path === "payload.lines[0].lineTotalCost")).toBe(
      true,
    );
    expect(result.issues.some((issue) => issue.path === "payload.cashTotal")).toBe(true);
  });

  test("rejects conflict payloads with invalid entity type and empty detected events", () => {
    const detected = validateEventPayload("conflict.detected", {
      conflictId: "conflict-1",
      entityType: "unknown",
      entityId: "entity-1",
      detectedEventIds: [],
      summary: "",
    });

    expect(detected.ok).toBe(false);
    if (detected.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(detected.issues.some((issue) => issue.path === "payload.entityType")).toBe(true);
    expect(detected.issues.some((issue) => issue.path === "payload.detectedEventIds")).toBe(true);

    const resolved = validateEventPayload("conflict.resolved", {
      conflictId: "conflict-1",
      resolution: "maybe",
      resolvedEventId: null,
      relatedEventIds: [123],
      notes: "",
    });

    expect(resolved.ok).toBe(false);
    if (resolved.ok) {
      throw new Error("Expected payload validation to fail");
    }
    expect(resolved.issues.some((issue) => issue.path === "payload.resolution")).toBe(true);
    expect(resolved.issues.some((issue) => issue.path === "payload.relatedEventIds[0]")).toBe(true);
  });
});

describe("validateEventEnvelope", () => {
  test("accepts valid event envelope", () => {
    const result = validateEventEnvelope({
      eventId: "event-1",
      eventType: "expense.recorded",
      occurredAt: "2026-03-12T10:00:00.000Z",
      recordedAt: "2026-03-12T10:00:01.000Z",
      actorUserId: "user-1",
      deviceId: "device-1",
      locationText: "Village A",
      schemaVersion: 1,
      correlationId: null,
      causationId: null,
      payload: {
        category: "Fuel",
        cashAmount: 12.5,
        notes: null,
        receiptRef: null,
      },
    });

    expect(result.ok).toBe(true);
  });

  test("rejects malformed event envelope", () => {
    const result = validateEventEnvelope({
      eventId: "",
      eventType: "not-real",
      occurredAt: "bad-date",
      actorUserId: "",
      deviceId: "",
      schemaVersion: 2,
      correlationId: 99,
      causationId: 101,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected envelope validation to fail");
    }
    expect(result.issues.some((issue) => issue.path === "event.eventType")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "event.occurredAt")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "event.schemaVersion")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "event.payload")).toBe(true);
  });
});

describe("validateEvent", () => {
  test("accepts valid event with matching envelope and payload", () => {
    const result = validateEvent({
      eventId: "event-2",
      eventType: "inventory.status_changed",
      occurredAt: "2026-03-12T10:00:00.000Z",
      actorUserId: "user-1",
      deviceId: "device-1",
      locationText: null,
      schemaVersion: 1,
      correlationId: null,
      causationId: null,
      payload: {
        inventoryBatchId: "batch-1",
        fromStatus: "storage",
        toStatus: "shop",
        quantity: 2,
        reason: "move",
        notes: null,
      },
    });

    expect(result.ok).toBe(true);
  });

  test("rejects event when payload is invalid even if envelope passes", () => {
    const result = validateEvent({
      eventId: "event-3",
      eventType: "inventory.status_changed",
      occurredAt: "2026-03-12T10:00:00.000Z",
      actorUserId: "user-1",
      deviceId: "device-1",
      locationText: null,
      schemaVersion: 1,
      correlationId: null,
      causationId: null,
      payload: {
        inventoryBatchId: "batch-1",
        fromStatus: "storage",
        toStatus: "storage",
        quantity: 0,
        reason: "",
        notes: null,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected event validation to fail");
    }
    expect(result.issues.some((issue) => issue.path === "payload.toStatus")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "payload.quantity")).toBe(true);
  });
});
