import type { Event } from "../../../../packages/shared/src/domain/events";
import type { PrismaClient } from "../generated/prisma/client";

type ProjectorExecutor = Pick<PrismaClient, "person" | "materialType" | "item">;

export const projectEventToReadModels = async (
  executor: ProjectorExecutor,
  event: Event,
): Promise<void> => {
  switch (event.eventType) {
    case "person.created": {
      await executor.person.upsert({
        where: { id: event.payload.personId },
        update: {
          name: event.payload.name,
          surname: event.payload.surname,
          idNumber: event.payload.idNumber ?? null,
          phone: event.payload.phone ?? null,
          address: event.payload.address ?? null,
          notes: event.payload.notes ?? null,
        },
        create: {
          id: event.payload.personId,
          name: event.payload.name,
          surname: event.payload.surname,
          idNumber: event.payload.idNumber ?? null,
          phone: event.payload.phone ?? null,
          address: event.payload.address ?? null,
          notes: event.payload.notes ?? null,
        },
      });
      return;
    }
    case "person.profile_updated": {
      await executor.person.update({
        where: { id: event.payload.personId },
        data: {
          ...(event.payload.updates.name !== undefined && { name: event.payload.updates.name }),
          ...(event.payload.updates.surname !== undefined && {
            surname: event.payload.updates.surname,
          }),
          ...(event.payload.updates.idNumber !== undefined && {
            idNumber: event.payload.updates.idNumber,
          }),
          ...(event.payload.updates.phone !== undefined && { phone: event.payload.updates.phone }),
          ...(event.payload.updates.address !== undefined && {
            address: event.payload.updates.address,
          }),
          ...(event.payload.updates.notes !== undefined && { notes: event.payload.updates.notes }),
        },
      });
      return;
    }
    case "material_type.created": {
      await executor.materialType.upsert({
        where: { id: event.payload.materialTypeId },
        update: {
          name: event.payload.name,
          pointsPerKg: event.payload.pointsPerKg.toString(),
        },
        create: {
          id: event.payload.materialTypeId,
          name: event.payload.name,
          pointsPerKg: event.payload.pointsPerKg.toString(),
        },
      });
      return;
    }
    case "material_type.updated": {
      await executor.materialType.update({
        where: { id: event.payload.materialTypeId },
        data: {
          ...(event.payload.updates.name !== undefined && { name: event.payload.updates.name }),
          ...(event.payload.updates.pointsPerKg !== undefined && {
            pointsPerKg: event.payload.updates.pointsPerKg.toString(),
          }),
        },
      });
      return;
    }
    case "item.created": {
      await executor.item.upsert({
        where: { id: event.payload.itemId },
        update: {
          name: event.payload.name,
          pointsPrice: event.payload.pointsPrice.toString(),
          costPrice:
            event.payload.costPrice === undefined || event.payload.costPrice === null
              ? null
              : event.payload.costPrice.toString(),
          sku: event.payload.sku ?? null,
        },
        create: {
          id: event.payload.itemId,
          name: event.payload.name,
          pointsPrice: event.payload.pointsPrice.toString(),
          costPrice:
            event.payload.costPrice === undefined || event.payload.costPrice === null
              ? null
              : event.payload.costPrice.toString(),
          sku: event.payload.sku ?? null,
        },
      });
      return;
    }
    case "item.updated": {
      await executor.item.update({
        where: { id: event.payload.itemId },
        data: {
          ...(event.payload.updates.name !== undefined && { name: event.payload.updates.name }),
          ...(event.payload.updates.pointsPrice !== undefined && {
            pointsPrice: event.payload.updates.pointsPrice.toString(),
          }),
          ...(event.payload.updates.costPrice !== undefined && {
            costPrice:
              event.payload.updates.costPrice === null
                ? null
                : event.payload.updates.costPrice.toString(),
          }),
          ...(event.payload.updates.sku !== undefined && { sku: event.payload.updates.sku }),
        },
      });
      return;
    }
    default: {
      return;
    }
  }
};
