import type { Event } from "../../../../packages/shared/src/domain/events";
import type { SyncCursor } from "../../../../packages/shared/src/domain/sync";
import type { PrismaClient } from "../generated/prisma/client";
import { refreshProjections } from "../projections/refresh";
import { createEventStore, type AppendEventResult } from "./event-store";
import { projectEventToReadModels } from "./project-event";

type PersonRecord = {
  id: string;
  name: string;
  surname: string;
  idNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

type MaterialRecord = {
  id: string;
  name: string;
  pointsPerKg: number;
};

type ItemRecord = {
  id: string;
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
};

type LedgerBalanceRecord = {
  personId: string;
  balancePoints: number;
};

type LedgerEntryRecord = {
  id: string;
  personId: string;
  deltaPoints: number;
  occurredAt: string;
  sourceEventType: string;
  sourceEventId: string;
};

type PullEventsResult = {
  events: Event[];
  nextCursor: SyncCursor | null;
};

type ProjectionStatusRecord = {
  latestCursor: SyncCursor | null;
  projectionRefreshedAt: string | null;
  projectionCursor: SyncCursor | null;
};

type LedgerBalanceRow = {
  person_id: string;
  balance_points: number;
};

type LedgerEntryRow = {
  id: string;
  person_id: string;
  delta_points: number;
  occurred_at: Date;
  source_event_type: string;
  source_event_id: string;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  return Number(value);
};

const toPersonRecord = (person: {
  id: string;
  name: string;
  surname: string;
  idNumber: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}): PersonRecord => ({
  id: person.id,
  name: person.name,
  surname: person.surname,
  idNumber: person.idNumber,
  phone: person.phone,
  address: person.address,
  notes: person.notes,
});

const toMaterialRecord = (material: {
  id: string;
  name: string;
  pointsPerKg: unknown;
}): MaterialRecord => ({
  id: material.id,
  name: material.name,
  pointsPerKg: toNumber(material.pointsPerKg),
});

const toItemRecord = (item: {
  id: string;
  name: string;
  pointsPrice: number;
  costPrice: unknown | null;
  sku: string | null;
}): ItemRecord => ({
  id: item.id,
  name: item.name,
  pointsPrice: item.pointsPrice,
  costPrice: item.costPrice === null ? null : toNumber(item.costPrice),
  sku: item.sku,
});

export const createCoreRepository = (prisma: PrismaClient) => {
  const eventStore = createEventStore(prisma);

  const listPeople = async (search?: string): Promise<PersonRecord[]> => {
    const hasSearch = search !== undefined && search.trim().length > 0;
    const rows = hasSearch
      ? await prisma.person.findMany({
          where: {
            OR: [
              {
                name: {
                  contains: search,
                },
              },
              {
                surname: {
                  contains: search,
                },
              },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : await prisma.person.findMany({
          orderBy: {
            createdAt: "desc",
          },
        });
    return rows.map(toPersonRecord);
  };

  const listMaterials = async (): Promise<MaterialRecord[]> => {
    const rows = await prisma.materialType.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return rows.map(toMaterialRecord);
  };

  const listItems = async (): Promise<ItemRecord[]> => {
    const rows = await prisma.item.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return rows.map(toItemRecord);
  };

  const getPersonById = async (personId: string): Promise<PersonRecord | null> => {
    const row = await prisma.person.findUnique({
      where: {
        id: personId,
      },
    });
    if (row === null) {
      return null;
    }
    return toPersonRecord(row);
  };

  const getMaterialById = async (materialTypeId: string): Promise<MaterialRecord | null> => {
    const row = await prisma.materialType.findUnique({
      where: {
        id: materialTypeId,
      },
    });
    if (row === null) {
      return null;
    }
    return toMaterialRecord(row);
  };

  const getItemById = async (itemId: string): Promise<ItemRecord | null> => {
    const row = await prisma.item.findUnique({
      where: {
        id: itemId,
      },
    });
    if (row === null) {
      return null;
    }
    return toItemRecord(row);
  };

  const appendEventAndProject = async (event: Event): Promise<AppendEventResult> => {
    const result = await prisma.$transaction(async (tx) => {
      const txEventStore = createEventStore(tx);
      const appendResult = await txEventStore.appendEvent(event);
      if (appendResult.status === "accepted") {
        await projectEventToReadModels(tx, event);
      }
      return appendResult;
    });

    if (result.status === "accepted") {
      await refreshProjections(prisma);
    }
    return result;
  };

  const appendEvents = async (events: Event[]): Promise<AppendEventResult[]> => {
    const acknowledgements: AppendEventResult[] = [];
    for (const event of events) {
      const result = await appendEventAndProject(event);
      acknowledgements.push(result);
    }
    return acknowledgements;
  };

  const getLedgerBalance = async (personId: string): Promise<LedgerBalanceRecord> => {
    const rows = await prisma.$queryRaw<LedgerBalanceRow[]>`
      select person_id, balance_points
      from mv_points_balances
      where person_id = ${personId}
      limit 1
    `;
    const row = rows[0];
    if (row === undefined) {
      return {
        personId,
        balancePoints: 0,
      };
    }
    return {
      personId: row.person_id,
      balancePoints: row.balance_points,
    };
  };

  const listLedgerEntries = async (personId: string): Promise<LedgerEntryRecord[]> => {
    const rows = await prisma.$queryRaw<LedgerEntryRow[]>`
      select id, person_id, delta_points, occurred_at, source_event_type, source_event_id
      from mv_points_ledger_entries
      where person_id = ${personId}
      order by occurred_at desc
    `;
    return rows.map((row) => ({
      id: row.id,
      personId: row.person_id,
      deltaPoints: row.delta_points,
      occurredAt: row.occurred_at.toISOString(),
      sourceEventType: row.source_event_type,
      sourceEventId: row.source_event_id,
    }));
  };

  const getLivePointsBalance = async (personId: string): Promise<number> => {
    const rows = await prisma.$queryRaw<
      {
        balance_points: number;
      }[]
    >`
      with ledger as (
        select
          case
            when event_type = 'intake.recorded' then (payload ->> 'totalPoints')::integer
            when event_type = 'sale.recorded' then ((payload ->> 'totalPoints')::integer * -1)
            when event_type = 'points.adjustment_applied' then (payload ->> 'deltaPoints')::integer
            else 0
          end as delta_points
        from event
        where payload ->> 'personId' = ${personId}
          and event_type in ('intake.recorded', 'sale.recorded', 'points.adjustment_applied')
      )
      select coalesce(sum(delta_points), 0)::integer as balance_points
      from ledger
    `;
    const first = rows[0];
    if (first === undefined) {
      return 0;
    }
    return first.balance_points;
  };

  const pullEvents = async (cursor: string | null, limit: number): Promise<PullEventsResult> =>
    eventStore.pullEvents(cursor, limit);

  const getSyncStatus = async (): Promise<ProjectionStatusRecord> => {
    const [latestCursor, freshness] = await Promise.all([
      eventStore.getLatestCursor(),
      eventStore.getProjectionFreshness(),
    ]);
    return {
      latestCursor,
      projectionRefreshedAt: freshness.refreshedAt,
      projectionCursor: freshness.cursor,
    };
  };

  return {
    listPeople,
    listMaterials,
    listItems,
    getPersonById,
    getMaterialById,
    getItemById,
    appendEventAndProject,
    appendEvents,
    getLedgerBalance,
    listLedgerEntries,
    getLivePointsBalance,
    pullEvents,
    getSyncStatus,
  };
};
