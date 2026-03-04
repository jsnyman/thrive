import type { PrismaClient } from "../generated/prisma/client";

type PersonRecord = {
  id: string;
  name: string;
  surname: string;
  idNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

type PersonCreateInput = {
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

type MaterialCreateInput = {
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

type ItemCreateInput = {
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

export const createCoreRepository = (prisma: PrismaClient) => {
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

  const createPerson = async (input: PersonCreateInput): Promise<PersonRecord> => {
    const created = await prisma.person.create({
      data: {
        name: input.name,
        surname: input.surname,
        idNumber: input.idNumber ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      },
    });
    return toPersonRecord(created);
  };

  const listMaterials = async (): Promise<MaterialRecord[]> => {
    const rows = await prisma.materialType.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return rows.map(toMaterialRecord);
  };

  const createMaterial = async (input: MaterialCreateInput): Promise<MaterialRecord> => {
    const created = await prisma.materialType.create({
      data: {
        name: input.name,
        pointsPerKg: input.pointsPerKg.toString(),
      },
    });
    return toMaterialRecord(created);
  };

  const listItems = async (): Promise<ItemRecord[]> => {
    const rows = await prisma.item.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    return rows.map(toItemRecord);
  };

  const createItem = async (input: ItemCreateInput): Promise<ItemRecord> => {
    const created = await prisma.item.create({
      data: {
        name: input.name,
        pointsPrice: input.pointsPrice,
        costPrice: input.costPrice === null || input.costPrice === undefined ? null : input.costPrice.toString(),
        sku: input.sku ?? null,
      },
    });
    return toItemRecord(created);
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

  return {
    listPeople,
    createPerson,
    listMaterials,
    createMaterial,
    listItems,
    createItem,
    getLedgerBalance,
    listLedgerEntries,
  };
};
