import { randomUUID } from "node:crypto";
import type { Event } from "../../../../packages/shared/src/domain/events";
import { createPrismaClient } from "../prisma";
import { createCoreRepository } from "../data/core-repository";

const DEVICE_ID = "bulk-script:move-all-storage-to-shop";

const run = async (): Promise<void> => {
  const actorUsername = process.env["STAFF_ACTOR_USERNAME"];
  if (actorUsername === undefined || actorUsername.trim().length === 0) {
    throw new Error("STAFF_ACTOR_USERNAME is required (an existing staff username to act as).");
  }

  const prisma = createPrismaClient();
  try {
    const actor = await prisma.staffUser.findUnique({ where: { username: actorUsername } });
    if (actor === null) {
      throw new Error(`No staff user found with username "${actorUsername}".`);
    }

    const repository = createCoreRepository(prisma);
    const batches = await repository.listInventoryBatches();
    const storageBatches = batches.filter((batch) => batch.quantities.storage > 0);

    console.log(`Found ${storageBatches.length} batch(es) with items in storage.`);

    let moved = 0;
    let failed = 0;
    for (const batch of storageBatches) {
      const quantity = batch.quantities.storage;
      const event: Event = {
        eventId: randomUUID(),
        eventType: "inventory.status_changed",
        occurredAt: new Date().toISOString(),
        actorUserId: actor.id,
        deviceId: DEVICE_ID,
        schemaVersion: 1,
        correlationId: null,
        causationId: null,
        locationText: null,
        payload: {
          inventoryBatchId: batch.inventoryBatchId,
          fromStatus: "storage",
          toStatus: "shop",
          quantity,
          reason: "Bulk move: all storage items moved to shop",
          notes: null,
        },
      };

      const result = await repository.appendEventAndProject(event);
      if (result.status === "accepted") {
        moved += 1;
        console.log(`Moved batch ${batch.inventoryBatchId}: ${quantity} unit(s) storage -> shop.`);
      } else {
        failed += 1;
        console.error(
          `Failed to move batch ${batch.inventoryBatchId}: ${result.status} ${result.reason ?? ""}`,
        );
      }
    }

    console.log(`Done. Moved ${moved} batch(es), ${failed} failure(s).`);
  } finally {
    await prisma.$disconnect();
  }
};

void run();
