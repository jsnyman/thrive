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
  collectionPointUpsert: jest.Mock;
  collectionPointUpdate: jest.Mock;
};

const createHarness = (): ProjectorHarness => {
  const personUpsert = jest.fn(async () => undefined);
  const personUpdate = jest.fn(async () => undefined);
  const materialUpsert = jest.fn(async () => undefined);
  const materialUpdate = jest.fn(async () => undefined);
  const itemUpsert = jest.fn(async () => undefined);
  const itemUpdate = jest.fn(async () => undefined);
  const collectionPointUpsert = jest.fn(async () => undefined);
  const collectionPointUpdate = jest.fn(async () => undefined);
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
    collectionPoint: {
      upsert: collectionPointUpsert,
      update: collectionPointUpdate,
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
    collectionPointUpsert,
    collectionPointUpdate,
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

  test("projects person create with an assigned collection point and reassignment on update", async () => {
    const harness = createHarness();

    const created: Event = {
      ...baseFields,
      eventType: "person.created",
      payload: {
        personId: "person-1",
        name: "Jane",
        surname: "Doe",
        assignedCollectionPointId: "cp-1",
      },
    };
    const updated: Event = {
      ...baseFields,
      eventType: "person.profile_updated",
      payload: {
        personId: "person-1",
        updates: {
          assignedCollectionPointId: "cp-2",
        },
      },
    };

    await projectEventToReadModels(harness.executor, created);
    await projectEventToReadModels(harness.executor, updated);

    const upsertCall = harness.personUpsert.mock.calls[0]?.[0] as {
      create: { assignedCollectionPointId: string | null };
      update: { assignedCollectionPointId: string | null };
    };
    expect(upsertCall.create.assignedCollectionPointId).toBe("cp-1");
    expect(upsertCall.update.assignedCollectionPointId).toBe("cp-1");
    expect(harness.personUpdate).toHaveBeenCalledWith({
      where: { id: "person-1" },
      data: { assignedCollectionPointId: "cp-2" },
    });
  });

  test("projects person profile update clearing the assigned collection point", async () => {
    const harness = createHarness();

    const updated: Event = {
      ...baseFields,
      eventType: "person.profile_updated",
      payload: {
        personId: "person-1",
        updates: {
          assignedCollectionPointId: null,
        },
      },
    };

    await projectEventToReadModels(harness.executor, updated);

    expect(harness.personUpdate).toHaveBeenCalledWith({
      where: { id: "person-1" },
      data: { assignedCollectionPointId: null },
    });
  });

  test("projects person removed — sets removedAt on the person record", async () => {
    const harness = createHarness();

    const removed: Event = {
      ...baseFields,
      occurredAt: "2026-06-04T09:00:00.000Z",
      eventType: "person.removed",
      payload: {
        personId: "person-1",
        reason: "left the community",
      },
    };

    await projectEventToReadModels(harness.executor, removed);

    expect(harness.personUpdate).toHaveBeenCalledTimes(1);
    expect(harness.personUpdate).toHaveBeenCalledWith({
      where: { id: "person-1" },
      data: { removedAt: new Date("2026-06-04T09:00:00.000Z") },
    });
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

  test("projects collection point create and rename", async () => {
    const harness = createHarness();

    const created: Event = {
      ...baseFields,
      eventType: "collection_point.created",
      payload: {
        collectionPointId: "cp-1",
        name: "Heuwelkroon parkie",
      },
    };
    const updated: Event = {
      ...baseFields,
      eventType: "collection_point.updated",
      payload: {
        collectionPointId: "cp-1",
        updates: {
          name: "Heuwelkroon parkie (renamed)",
        },
      },
    };

    await projectEventToReadModels(harness.executor, created);
    await projectEventToReadModels(harness.executor, updated);

    expect(harness.collectionPointUpsert).toHaveBeenCalledTimes(1);
    expect(harness.collectionPointUpsert).toHaveBeenCalledWith({
      where: { id: "cp-1" },
      update: { name: "Heuwelkroon parkie" },
      create: { id: "cp-1", name: "Heuwelkroon parkie" },
    });
    expect(harness.collectionPointUpdate).toHaveBeenCalledTimes(1);
    expect(harness.collectionPointUpdate).toHaveBeenCalledWith({
      where: { id: "cp-1" },
      data: { name: "Heuwelkroon parkie (renamed)" },
    });
  });

  test("projects collection point deactivation via update", async () => {
    const harness = createHarness();

    const updated: Event = {
      ...baseFields,
      eventType: "collection_point.updated",
      payload: {
        collectionPointId: "cp-1",
        updates: {
          isActive: false,
        },
      },
    };

    await projectEventToReadModels(harness.executor, updated);

    expect(harness.collectionPointUpdate).toHaveBeenCalledWith({
      where: { id: "cp-1" },
      data: { isActive: false },
    });
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

  test("procurement.recorded — updates costPrice and pointsPrice for each line item", async () => {
    const harness = createHarness();

    const event: Event = {
      ...baseFields,
      eventType: "procurement.recorded",
      payload: {
        supplierName: "Village Supplier",
        tripDistanceKm: null,
        cashTotal: 6,
        lines: [
          {
            itemId: "item-1",
            inventoryBatchId: "batch-1",
            quantity: 2,
            unitCost: 3,
            lineTotalCost: 6,
            unitSellingPrice: 3.5,
            markupPercent: 16.67,
          },
        ],
      },
    };

    await projectEventToReadModels(harness.executor, event);

    expect(harness.itemUpdate).not.toHaveBeenCalled();
    expect(harness.itemUpsert).toHaveBeenCalledTimes(1);
    expect(harness.itemUpsert).toHaveBeenCalledWith({
      where: { id: "item-1" },
      update: { costPrice: "3", pointsPrice: "3.5" },
      create: { id: "item-1", name: "item-1", costPrice: "3", pointsPrice: "3.5" },
    });
  });

  test("procurement.recorded — skips pointsPrice upsert when unitSellingPrice is 0", async () => {
    const harness = createHarness();

    const event: Event = {
      ...baseFields,
      eventType: "procurement.recorded",
      payload: {
        supplierName: null,
        tripDistanceKm: null,
        cashTotal: 6,
        lines: [
          {
            itemId: "item-2",
            inventoryBatchId: "batch-2",
            quantity: 2,
            unitCost: 3,
            lineTotalCost: 6,
            unitSellingPrice: 0,
            markupPercent: 0,
          },
        ],
      },
    };

    await projectEventToReadModels(harness.executor, event);

    expect(harness.itemUpdate).not.toHaveBeenCalled();
    expect(harness.itemUpsert).toHaveBeenCalledTimes(1);
    expect(harness.itemUpsert).toHaveBeenCalledWith({
      where: { id: "item-2" },
      update: { costPrice: "3" },
      create: { id: "item-2", name: "item-2", costPrice: "3", pointsPrice: "0" },
    });
  });

  test("procurement.recorded — updates multiple line items", async () => {
    const harness = createHarness();

    const event: Event = {
      ...baseFields,
      eventType: "procurement.recorded",
      payload: {
        supplierName: null,
        tripDistanceKm: null,
        cashTotal: 11,
        lines: [
          {
            itemId: "item-1",
            inventoryBatchId: "batch-1",
            quantity: 2,
            unitCost: 3,
            lineTotalCost: 6,
            unitSellingPrice: 3.5,
            markupPercent: 16.67,
          },
          {
            itemId: "item-2",
            inventoryBatchId: "batch-2",
            quantity: 1,
            unitCost: 5,
            lineTotalCost: 5,
            unitSellingPrice: 5.8,
            markupPercent: 16,
          },
        ],
      },
    };

    await projectEventToReadModels(harness.executor, event);

    expect(harness.itemUpdate).not.toHaveBeenCalled();
    expect(harness.itemUpsert).toHaveBeenCalledTimes(2);
    expect(harness.itemUpsert).toHaveBeenNthCalledWith(1, {
      where: { id: "item-1" },
      update: { costPrice: "3", pointsPrice: "3.5" },
      create: { id: "item-1", name: "item-1", costPrice: "3", pointsPrice: "3.5" },
    });
    expect(harness.itemUpsert).toHaveBeenNthCalledWith(2, {
      where: { id: "item-2" },
      update: { costPrice: "5", pointsPrice: "5.8" },
      create: { id: "item-2", name: "item-2", costPrice: "5", pointsPrice: "5.8" },
    });
  });

  test("procurement.corrected — upserts costPrice and pointsPrice for each line item", async () => {
    const harness = createHarness();

    const event: Event = {
      ...baseFields,
      eventType: "procurement.corrected",
      payload: {
        procurementEventId: "event-1",
        supplierName: null,
        tripDistanceKm: null,
        cashTotal: 8,
        lines: [
          {
            itemId: "item-1",
            inventoryBatchId: "batch-1",
            quantity: 2,
            unitCost: 4,
            lineTotalCost: 8,
            unitSellingPrice: 4.7,
            markupPercent: 17.5,
          },
        ],
        reason: "Corrected unit cost",
      },
    };

    await projectEventToReadModels(harness.executor, event);

    expect(harness.itemUpdate).not.toHaveBeenCalled();
    expect(harness.itemUpsert).toHaveBeenCalledTimes(1);
    expect(harness.itemUpsert).toHaveBeenCalledWith({
      where: { id: "item-1" },
      update: { costPrice: "4", pointsPrice: "4.7" },
      create: { id: "item-1", name: "item-1", costPrice: "4", pointsPrice: "4.7" },
    });
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
    expect(harness.collectionPointUpsert).not.toHaveBeenCalled();
    expect(harness.collectionPointUpdate).not.toHaveBeenCalled();
  });
});
