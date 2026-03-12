import type { Event } from "../../../../packages/shared/src/domain/events";
import { projectEventToReadModels } from "./project-event";

type ProjectorExecutor = Parameters<typeof projectEventToReadModels>[0];

type ProjectorHarness = {
  executor: ProjectorExecutor;
  personUpsert: jest.Mock;
  personUpdate: jest.Mock;
  materialUpsert: jest.Mock;
  materialUpdate: jest.Mock;
  itemUpsert: jest.Mock;
  itemUpdate: jest.Mock;
};

const createHarness = (): ProjectorHarness => {
  const personUpsert = jest.fn(async () => undefined);
  const personUpdate = jest.fn(async () => undefined);
  const materialUpsert = jest.fn(async () => undefined);
  const materialUpdate = jest.fn(async () => undefined);
  const itemUpsert = jest.fn(async () => undefined);
  const itemUpdate = jest.fn(async () => undefined);
  const executor = {
    person: {
      upsert: personUpsert,
      update: personUpdate,
    },
    materialType: {
      upsert: materialUpsert,
      update: materialUpdate,
    },
    item: {
      upsert: itemUpsert,
      update: itemUpdate,
    },
  } as unknown as ProjectorExecutor;
  return {
    executor,
    personUpsert,
    personUpdate,
    materialUpsert,
    materialUpdate,
    itemUpsert,
    itemUpdate,
  };
};

const baseFields = {
  eventId: "event-1",
  occurredAt: "2026-03-08T10:00:00.000Z",
  actorUserId: "user-1",
  deviceId: "device-1",
  locationText: null,
  schemaVersion: 1,
  correlationId: null,
  causationId: null,
} as const;

describe("projectEventToReadModels", () => {
  test("projects person create and profile update", async () => {
    const harness = createHarness();

    const created: Event = {
      ...baseFields,
      eventType: "person.created",
      payload: {
        personId: "person-1",
        name: "Jane",
        surname: "Doe",
        idNumber: "8001015009087",
        phone: "0821234567",
        address: "Village A",
        notes: "new",
      },
    };
    const updated: Event = {
      ...baseFields,
      eventType: "person.profile_updated",
      payload: {
        personId: "person-1",
        updates: {
          surname: "Updated",
          phone: null,
        },
      },
    };

    await projectEventToReadModels(harness.executor, created);
    await projectEventToReadModels(harness.executor, updated);

    expect(harness.personUpsert).toHaveBeenCalledTimes(1);
    expect(harness.personUpdate).toHaveBeenCalledTimes(1);
  });

  test("projects material create and update", async () => {
    const harness = createHarness();

    const created: Event = {
      ...baseFields,
      eventType: "material_type.created",
      payload: {
        materialTypeId: "mat-1",
        name: "PET",
        pointsPerKg: 3.2,
      },
    };
    const updated: Event = {
      ...baseFields,
      eventType: "material_type.updated",
      payload: {
        materialTypeId: "mat-1",
        updates: {
          name: "PET Updated",
          pointsPerKg: 4.1,
        },
      },
    };

    await projectEventToReadModels(harness.executor, created);
    await projectEventToReadModels(harness.executor, updated);

    expect(harness.materialUpsert).toHaveBeenCalledTimes(1);
    expect(harness.materialUpdate).toHaveBeenCalledTimes(1);
  });

  test("projects item create and update", async () => {
    const harness = createHarness();

    const created: Event = {
      ...baseFields,
      eventType: "item.created",
      payload: {
        itemId: "item-1",
        name: "Soap",
        pointsPrice: 10.5,
        costPrice: 4,
        sku: "SKU-1",
      },
    };
    const updated: Event = {
      ...baseFields,
      eventType: "item.updated",
      payload: {
        itemId: "item-1",
        updates: {
          pointsPrice: 12.4,
          costPrice: null,
          sku: null,
        },
      },
    };

    await projectEventToReadModels(harness.executor, created);
    await projectEventToReadModels(harness.executor, updated);

    expect(harness.itemUpsert).toHaveBeenCalledTimes(1);
    expect(harness.itemUpdate).toHaveBeenCalledTimes(1);
    const itemUpsertCall = harness.itemUpsert.mock.calls[0]?.[0] as {
      create: {
        pointsPrice: string;
      };
    };
    const itemUpdateCall = harness.itemUpdate.mock.calls[0]?.[0] as {
      data: {
        pointsPrice: string;
      };
    };
    expect(itemUpsertCall.create.pointsPrice).toBe("10.5");
    expect(itemUpdateCall.data.pointsPrice).toBe("12.4");
  });

  test("ignores non-projected event types", async () => {
    const harness = createHarness();
    const saleEvent: Event = {
      ...baseFields,
      eventType: "sale.recorded",
      payload: {
        personId: "person-1",
        lines: [
          {
            itemId: "item-1",
            inventoryBatchId: "batch-1",
            quantity: 1,
            pointsPrice: 10.5,
            lineTotalPoints: 10.5,
          },
        ],
        totalPoints: 10.5,
        locationText: null,
      },
    };

    await projectEventToReadModels(harness.executor, saleEvent);

    expect(harness.personUpsert).not.toHaveBeenCalled();
    expect(harness.personUpdate).not.toHaveBeenCalled();
    expect(harness.materialUpsert).not.toHaveBeenCalled();
    expect(harness.materialUpdate).not.toHaveBeenCalled();
    expect(harness.itemUpsert).not.toHaveBeenCalled();
    expect(harness.itemUpdate).not.toHaveBeenCalled();
  });
});
