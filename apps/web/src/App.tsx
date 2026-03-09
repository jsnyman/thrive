import {
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Select,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type { Event } from "../../../packages/shared/src/domain/events";
import type { EventQueue } from "./offline/event-queue";
import { createAuthClient, type AuthUser } from "./offline/auth-client";
import {
  createInventoryClient,
  type InventoryBatchState,
  type InventoryStatus,
  type InventoryStatusSummary,
} from "./offline/inventory-client";
import { createItemsClient, type ItemRecord } from "./offline/items-client";
import { createLedgerClient, type LedgerBalance, type LedgerEntry } from "./offline/ledger-client";
import { createMaterialsClient, type MaterialRecord } from "./offline/materials-client";
import { createPeopleClient, type PersonRecord } from "./offline/people-client";
import type { SyncStateStore } from "./offline/sync-state-store";
import { useSync } from "./offline/use-sync";
import "./app.css";

type AppProps = {
  queue?: EventQueue | null;
  syncStateStore?: SyncStateStore | null;
};

type SessionStatus = "loading" | "anonymous" | "authenticated";

type IntakeDraftLine = {
  lineId: string;
  materialTypeId: string | null;
  weightKg: string;
};

type IntakeEventLineInput = {
  materialTypeId: string;
  weightKg: number;
  pointsPerKg: number;
};

type SaleDraftLine = {
  lineId: string;
  itemId: string | null;
  quantity: string;
  inventoryBatchId: string | null;
};

type SaleEventLineInput = {
  itemId: string;
  inventoryBatchId: string;
  quantity: number;
  pointsPrice: number;
};

type ProcurementDraftLine = {
  lineId: string;
  itemId: string | null;
  quantity: string;
  unitCost: string;
};

type ProcurementEventLineInput = {
  itemId: string;
  inventoryBatchId: string;
  quantity: number;
  unitCost: number;
};

type ExpenseRecordedInput = {
  category: string;
  cashAmount: number;
  notes?: string | null;
  receiptRef?: string | null;
};

type InventoryAdjustmentStatus = "spoiled" | "damaged" | "missing";

const inventoryStatuses: InventoryStatus[] = [
  "storage",
  "shop",
  "sold",
  "spoiled",
  "damaged",
  "missing",
];
const inventoryAdjustmentStatuses: InventoryAdjustmentStatus[] = ["spoiled", "damaged", "missing"];

const syncBadgeColor = (status: "idle" | "running" | "success" | "error"): string => {
  if (status === "running") {
    return "yellow";
  }
  if (status === "success") {
    return "green";
  }
  if (status === "error") {
    return "red";
  }
  return "gray";
};

const maskSensitiveValue = (value: string | null | undefined): string => {
  if (value === undefined || value === null || value.trim().length === 0) {
    return "Not set";
  }
  const normalized = value.trim();
  if (normalized.length <= 2) {
    return "****";
  }
  return `****${normalized.slice(-2)}`;
};

const toNullableOrUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
};

const buildCreatePersonEvent = (
  actor: AuthUser,
  payload: {
    name: string;
    surname: string;
    idNumber?: string | null;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
  },
): Event => ({
  eventId: crypto.randomUUID(),
  eventType: "person.created",
  occurredAt: new Date().toISOString(),
  actorUserId: actor.id,
  deviceId: "web-registry",
  schemaVersion: 1,
  correlationId: null,
  causationId: null,
  locationText: null,
  payload: {
    personId: crypto.randomUUID(),
    name: payload.name,
    surname: payload.surname,
    idNumber: payload.idNumber ?? null,
    phone: payload.phone ?? null,
    address: payload.address ?? null,
    notes: payload.notes ?? null,
  },
});

const buildUpdatePersonEvent = (
  actor: AuthUser,
  personId: string,
  updates: {
    name?: string;
    surname?: string;
    idNumber?: string | null;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
  },
): Event => ({
  eventId: crypto.randomUUID(),
  eventType: "person.profile_updated",
  occurredAt: new Date().toISOString(),
  actorUserId: actor.id,
  deviceId: "web-registry",
  schemaVersion: 1,
  correlationId: null,
  causationId: null,
  locationText: null,
  payload: {
    personId,
    updates,
  },
});

const buildIntakeRecordedEvent = (
  actor: AuthUser,
  payload: {
    personId: string;
    lines: IntakeEventLineInput[];
  },
): Event => {
  const lines = payload.lines.map((line) => ({
    materialTypeId: line.materialTypeId,
    weightKg: line.weightKg,
    pointsPerKg: line.pointsPerKg,
    pointsAwarded: Math.floor(line.weightKg * line.pointsPerKg),
  }));
  const totalPoints = lines.reduce((sum, line) => sum + line.pointsAwarded, 0);
  return {
    eventId: crypto.randomUUID(),
    eventType: "intake.recorded",
    occurredAt: new Date().toISOString(),
    actorUserId: actor.id,
    deviceId: "web-registry",
    schemaVersion: 1,
    correlationId: null,
    causationId: null,
    locationText: null,
    payload: {
      personId: payload.personId,
      lines,
      totalPoints,
      locationText: null,
    },
  };
};

const createIntakeDraftLine = (defaultMaterialId: string | null = null): IntakeDraftLine => ({
  lineId: `${crypto.randomUUID()}-${Math.random().toString(36).slice(2)}`,
  materialTypeId: defaultMaterialId,
  weightKg: "",
});

const createSaleDraftLine = (defaultItemId: string | null = null): SaleDraftLine => ({
  lineId: `${crypto.randomUUID()}-${Math.random().toString(36).slice(2)}`,
  itemId: defaultItemId,
  quantity: "",
  inventoryBatchId: null,
});

const createProcurementDraftLine = (defaultItemId: string | null = null): ProcurementDraftLine => ({
  lineId: `${crypto.randomUUID()}-${Math.random().toString(36).slice(2)}`,
  itemId: defaultItemId,
  quantity: "",
  unitCost: "",
});

const buildSaleRecordedEvent = (
  actor: AuthUser,
  payload: {
    personId: string;
    lines: SaleEventLineInput[];
  },
): Event => {
  const lines = payload.lines.map((line) => ({
    itemId: line.itemId,
    inventoryBatchId: line.inventoryBatchId,
    quantity: line.quantity,
    pointsPrice: line.pointsPrice,
    lineTotalPoints: line.quantity * line.pointsPrice,
  }));
  const totalPoints = lines.reduce((sum, line) => sum + line.lineTotalPoints, 0);
  return {
    eventId: crypto.randomUUID(),
    eventType: "sale.recorded",
    occurredAt: new Date().toISOString(),
    actorUserId: actor.id,
    deviceId: "web-registry",
    schemaVersion: 1,
    correlationId: null,
    causationId: null,
    locationText: null,
    payload: {
      personId: payload.personId,
      lines,
      totalPoints,
      locationText: null,
    },
  };
};

const buildProcurementRecordedEvent = (
  actor: AuthUser,
  payload: {
    supplierName?: string | null;
    tripDistanceKm?: number | null;
    lines: ProcurementEventLineInput[];
  },
): Event => {
  const lines = payload.lines.map((line) => ({
    itemId: line.itemId,
    inventoryBatchId: line.inventoryBatchId,
    quantity: line.quantity,
    unitCost: line.unitCost,
    lineTotalCost: line.quantity * line.unitCost,
  }));
  const cashTotal = lines.reduce((sum, line) => sum + line.lineTotalCost, 0);
  return {
    eventId: crypto.randomUUID(),
    eventType: "procurement.recorded",
    occurredAt: new Date().toISOString(),
    actorUserId: actor.id,
    deviceId: "web-registry",
    schemaVersion: 1,
    correlationId: null,
    causationId: null,
    locationText: null,
    payload: {
      supplierName: payload.supplierName ?? null,
      tripDistanceKm: payload.tripDistanceKm ?? null,
      cashTotal,
      lines,
    },
  };
};

const buildExpenseRecordedEvent = (actor: AuthUser, payload: ExpenseRecordedInput): Event => ({
  eventId: crypto.randomUUID(),
  eventType: "expense.recorded",
  occurredAt: new Date().toISOString(),
  actorUserId: actor.id,
  deviceId: "web-registry",
  schemaVersion: 1,
  correlationId: null,
  causationId: null,
  locationText: null,
  payload: {
    category: payload.category,
    cashAmount: payload.cashAmount,
    notes: payload.notes ?? null,
    receiptRef: payload.receiptRef ?? null,
  },
});

const buildInventoryStatusChangedEvent = (
  actor: AuthUser,
  payload: {
    inventoryBatchId: string;
    fromStatus: InventoryStatus;
    toStatus: InventoryStatus;
    quantity: number;
    reason?: string | null;
    notes?: string | null;
  },
): Event => ({
  eventId: crypto.randomUUID(),
  eventType: "inventory.status_changed",
  occurredAt: new Date().toISOString(),
  actorUserId: actor.id,
  deviceId: "web-registry",
  schemaVersion: 1,
  correlationId: null,
  causationId: null,
  locationText: null,
  payload: {
    inventoryBatchId: payload.inventoryBatchId,
    fromStatus: payload.fromStatus,
    toStatus: payload.toStatus,
    quantity: payload.quantity,
    reason: payload.reason ?? null,
    notes: payload.notes ?? null,
  },
});

const buildInventoryAdjustmentRequestedEvent = (
  actor: AuthUser,
  payload: {
    inventoryBatchId: string;
    requestedStatus: InventoryAdjustmentStatus;
    quantity: number;
    reason: string;
    notes?: string | null;
  },
): Event => ({
  eventId: crypto.randomUUID(),
  eventType: "inventory.adjustment_requested",
  occurredAt: new Date().toISOString(),
  actorUserId: actor.id,
  deviceId: "web-registry",
  schemaVersion: 1,
  correlationId: null,
  causationId: null,
  locationText: null,
  payload: {
    inventoryBatchId: payload.inventoryBatchId,
    requestedStatus: payload.requestedStatus,
    quantity: payload.quantity,
    reason: payload.reason,
    notes: payload.notes ?? null,
  },
});

export const App = ({ queue = null, syncStateStore = null }: AppProps): JSX.Element => {
  const authClient = useMemo(() => createAuthClient(), []);
  const peopleClient = useMemo(() => createPeopleClient(), []);
  const materialsClient = useMemo(() => createMaterialsClient(), []);
  const itemsClient = useMemo(() => createItemsClient(), []);
  const inventoryClient = useMemo(() => createInventoryClient(), []);
  const ledgerClient = useMemo(() => createLedgerClient(), []);

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [username, setUsername] = useState<string>("");
  const [passcode, setPasscode] = useState<string>("");
  const [loginPending, setLoginPending] = useState<boolean>(false);

  const [search, setSearch] = useState<string>("");
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [peopleLoading, setPeopleLoading] = useState<boolean>(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState<boolean>(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [itemsLoading, setItemsLoading] = useState<boolean>(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [createName, setCreateName] = useState<string>("");
  const [createSurname, setCreateSurname] = useState<string>("");
  const [createIdNumber, setCreateIdNumber] = useState<string>("");
  const [createPhone, setCreatePhone] = useState<string>("");
  const [createAddress, setCreateAddress] = useState<string>("");
  const [createNotes, setCreateNotes] = useState<string>("");
  const [createPending, setCreatePending] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editSurname, setEditSurname] = useState<string>("");
  const [editIdNumber, setEditIdNumber] = useState<string>("");
  const [editPhone, setEditPhone] = useState<string>("");
  const [editAddress, setEditAddress] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editPending, setEditPending] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [intakePersonId, setIntakePersonId] = useState<string | null>(null);
  const [intakeLines, setIntakeLines] = useState<IntakeDraftLine[]>(() => [
    createIntakeDraftLine(),
  ]);
  const [intakePending, setIntakePending] = useState<boolean>(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [salePersonId, setSalePersonId] = useState<string | null>(null);
  const [saleLines, setSaleLines] = useState<SaleDraftLine[]>(() => [createSaleDraftLine()]);
  const [salePending, setSalePending] = useState<boolean>(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [procurementLines, setProcurementLines] = useState<ProcurementDraftLine[]>(() => [
    createProcurementDraftLine(),
  ]);
  const [procurementSupplierName, setProcurementSupplierName] = useState<string>("");
  const [procurementTripDistanceKm, setProcurementTripDistanceKm] = useState<string>("");
  const [procurementPending, setProcurementPending] = useState<boolean>(false);
  const [procurementError, setProcurementError] = useState<string | null>(null);
  const [expenseCategory, setExpenseCategory] = useState<string>("");
  const [expenseCashAmount, setExpenseCashAmount] = useState<string>("");
  const [expenseNotes, setExpenseNotes] = useState<string>("");
  const [expenseReceiptRef, setExpenseReceiptRef] = useState<string>("");
  const [expensePending, setExpensePending] = useState<boolean>(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const [ledgerPersonId, setLedgerPersonId] = useState<string | null>(null);
  const [ledgerBalance, setLedgerBalance] = useState<LedgerBalance | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [inventorySummary, setInventorySummary] = useState<InventoryStatusSummary[]>([]);
  const [inventoryBatches, setInventoryBatches] = useState<InventoryBatchState[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState<boolean>(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [statusChangeBatchId, setStatusChangeBatchId] = useState<string | null>(null);
  const [statusChangeFromStatus, setStatusChangeFromStatus] = useState<InventoryStatus>("storage");
  const [statusChangeToStatus, setStatusChangeToStatus] = useState<InventoryStatus>("shop");
  const [statusChangeQuantity, setStatusChangeQuantity] = useState<string>("");
  const [statusChangeReason, setStatusChangeReason] = useState<string>("");
  const [statusChangeNotes, setStatusChangeNotes] = useState<string>("");
  const [statusChangePending, setStatusChangePending] = useState<boolean>(false);
  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [adjustmentBatchId, setAdjustmentBatchId] = useState<string | null>(null);
  const [adjustmentStatus, setAdjustmentStatus] = useState<InventoryAdjustmentStatus>("spoiled");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState<string>("");
  const [adjustmentReason, setAdjustmentReason] = useState<string>("");
  const [adjustmentNotes, setAdjustmentNotes] = useState<string>("");
  const [adjustmentPending, setAdjustmentPending] = useState<boolean>(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  const sync = useSync({
    queue: sessionStatus === "authenticated" ? queue : null,
    syncStateStore: sessionStatus === "authenticated" ? syncStateStore : null,
  });

  const selectedPerson = useMemo(() => {
    if (selectedPersonId === null) {
      return null;
    }
    return people.find((person) => person.id === selectedPersonId) ?? null;
  }, [people, selectedPersonId]);
  const canRecordSales = sessionUser?.role === "shop_operator" || sessionUser?.role === "manager";
  const canRecordProcurement = sessionUser?.role === "manager";
  const canRecordExpenses = sessionUser?.role === "manager";

  const intakeLinePreviews = useMemo(
    () =>
      intakeLines.map((line) => {
        if (line.materialTypeId === null) {
          return null;
        }
        const material = materials.find((entry) => entry.id === line.materialTypeId) ?? null;
        if (material === null) {
          return null;
        }
        const weight = Number.parseFloat(line.weightKg);
        if (!Number.isFinite(weight) || weight <= 0) {
          return null;
        }
        return Math.floor(weight * material.pointsPerKg);
      }),
    [intakeLines, materials],
  );

  const intakeTotalPreviewPoints = useMemo(
    () =>
      intakeLinePreviews.reduce<number>((sum, previewPoints) => {
        if (previewPoints === null) {
          return sum;
        }
        return sum + previewPoints;
      }, 0),
    [intakeLinePreviews],
  );

  const saleTotalPreviewPoints = useMemo(
    () =>
      saleLines.reduce<number>((sum, line) => {
        if (line.itemId === null) {
          return sum;
        }
        const item = items.find((entry) => entry.id === line.itemId) ?? null;
        if (item === null) {
          return sum;
        }
        const quantity = Number.parseInt(line.quantity, 10);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return sum;
        }
        return sum + item.pointsPrice * quantity;
      }, 0),
    [items, saleLines],
  );

  const procurementTotalPreviewCost = useMemo(
    () =>
      procurementLines.reduce<number>((sum, line) => {
        const quantity = Number.parseInt(line.quantity, 10);
        const unitCost = Number.parseFloat(line.unitCost);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return sum;
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          return sum;
        }
        return sum + quantity * unitCost;
      }, 0),
    [procurementLines],
  );

  const loadPeople = async (searchText?: string): Promise<void> => {
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const next = await peopleClient.listPeople(searchText);
      setPeople(next);
      if (selectedPersonId !== null && !next.some((person) => person.id === selectedPersonId)) {
        setSelectedPersonId(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPeopleError(message);
    } finally {
      setPeopleLoading(false);
    }
  };

  const loadMaterials = async (): Promise<void> => {
    setMaterialsLoading(true);
    setMaterialsError(null);
    try {
      const next = await materialsClient.listMaterials();
      setMaterials(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMaterialsError(message);
    } finally {
      setMaterialsLoading(false);
    }
  };

  const loadItems = async (): Promise<void> => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const next = await itemsClient.listItems();
      setItems(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setItemsError(message);
    } finally {
      setItemsLoading(false);
    }
  };

  const loadLedger = async (personId: string): Promise<void> => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const [balance, entries] = await Promise.all([
        ledgerClient.getBalance(personId),
        ledgerClient.listEntries(personId),
      ]);
      setLedgerBalance(balance);
      setLedgerEntries(entries);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLedgerError(message);
    } finally {
      setLedgerLoading(false);
    }
  };

  const loadInventory = async (): Promise<void> => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const [summary, batches] = await Promise.all([
        inventoryClient.listStatusSummary(),
        inventoryClient.listBatches(),
      ]);
      setInventorySummary(summary);
      setInventoryBatches(batches);
      if (statusChangeBatchId === null && batches[0] !== undefined) {
        setStatusChangeBatchId(batches[0].inventoryBatchId);
      }
      if (adjustmentBatchId === null && batches[0] !== undefined) {
        setAdjustmentBatchId(batches[0].inventoryBatchId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInventoryError(message);
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadSession = async (): Promise<void> => {
      setSessionStatus("loading");
      setSessionError(null);
      try {
        const session = await authClient.loadSession();
        if (cancelled) {
          return;
        }
        if (session === null) {
          setSessionStatus("anonymous");
          setSessionUser(null);
          return;
        }
        setSessionUser(session);
        setSessionStatus("authenticated");
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setSessionError(message);
        setSessionStatus("anonymous");
      }
    };
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [authClient]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      return;
    }
    void loadPeople();
    void loadMaterials();
    void loadItems();
    void loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  useEffect(() => {
    const firstPerson = people[0];
    if (firstPerson === undefined) {
      return;
    }
    if (intakePersonId === null) {
      setIntakePersonId(firstPerson.id);
    }
    if (ledgerPersonId === null) {
      setLedgerPersonId(firstPerson.id);
    }
    if (salePersonId === null) {
      setSalePersonId(firstPerson.id);
    }
  }, [intakePersonId, ledgerPersonId, people, salePersonId]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || ledgerPersonId === null) {
      return;
    }
    void loadLedger(ledgerPersonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, ledgerPersonId]);

  useEffect(() => {
    if (materials.length === 0) {
      return;
    }
    const defaultMaterialId = materials[0]?.id ?? null;
    if (defaultMaterialId === null) {
      return;
    }
    setIntakeLines((previous) =>
      previous.map((line) => {
        if (line.materialTypeId !== null) {
          return line;
        }
        return {
          ...line,
          materialTypeId: defaultMaterialId,
        };
      }),
    );
  }, [materials]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const defaultItemId = items[0]?.id ?? null;
    if (defaultItemId === null) {
      return;
    }
    setSaleLines((previous) =>
      previous.map((line) => {
        if (line.itemId !== null) {
          return line;
        }
        return {
          ...line,
          itemId: defaultItemId,
        };
      }),
    );
  }, [items]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const defaultItemId = items[0]?.id ?? null;
    if (defaultItemId === null) {
      return;
    }
    setProcurementLines((previous) =>
      previous.map((line) => {
        if (line.itemId !== null) {
          return line;
        }
        return {
          ...line,
          itemId: defaultItemId,
        };
      }),
    );
  }, [items]);

  const handleLogin = async (): Promise<void> => {
    if (username.trim().length === 0 || passcode.trim().length === 0) {
      setSessionError("Username and passcode are required");
      return;
    }
    setLoginPending(true);
    setSessionError(null);
    try {
      const user = await authClient.login(username.trim(), passcode.trim());
      setSessionUser(user);
      setSessionStatus("authenticated");
      setPasscode("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSessionError(message);
      setSessionStatus("anonymous");
    } finally {
      setLoginPending(false);
    }
  };

  const handleLogout = (): void => {
    authClient.logout();
    setSessionStatus("anonymous");
    setSessionUser(null);
    setPeople([]);
    setMaterials([]);
    setItems([]);
    setSelectedPersonId(null);
    setLedgerPersonId(null);
    setSalePersonId(null);
    setSaleLines([createSaleDraftLine()]);
    setProcurementLines([createProcurementDraftLine()]);
    setProcurementSupplierName("");
    setProcurementTripDistanceKm("");
    setLedgerBalance(null);
    setLedgerEntries([]);
    setInventorySummary([]);
    setInventoryBatches([]);
    setStatusChangeBatchId(null);
    setAdjustmentBatchId(null);
  };

  const handleCreate = async (): Promise<void> => {
    if (queue === null || sessionUser === null) {
      setCreateError("Queue is unavailable");
      return;
    }
    if (createName.trim().length === 0 || createSurname.trim().length === 0) {
      setCreateError("Name and surname are required");
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    try {
      await queue.enqueue(
        buildCreatePersonEvent(sessionUser, {
          name: createName.trim(),
          surname: createSurname.trim(),
          idNumber: toNullableOrUndefined(createIdNumber) ?? null,
          phone: toNullableOrUndefined(createPhone) ?? null,
          address: toNullableOrUndefined(createAddress) ?? null,
          notes: toNullableOrUndefined(createNotes) ?? null,
        }),
      );
      await sync.syncNow();
      await loadPeople(search);
      setCreateName("");
      setCreateSurname("");
      setCreateIdNumber("");
      setCreatePhone("");
      setCreateAddress("");
      setCreateNotes("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCreateError(message);
    } finally {
      setCreatePending(false);
    }
  };

  const handleEdit = async (): Promise<void> => {
    if (queue === null || sessionUser === null || selectedPerson === null) {
      setEditError("Select a person to edit");
      return;
    }
    const updates: {
      name?: string;
      surname?: string;
      idNumber?: string | null;
      phone?: string | null;
      address?: string | null;
      notes?: string | null;
    } = {};

    const nextName = toNullableOrUndefined(editName);
    const nextSurname = toNullableOrUndefined(editSurname);
    const nextIdNumber = toNullableOrUndefined(editIdNumber);
    const nextPhone = toNullableOrUndefined(editPhone);
    const nextAddress = toNullableOrUndefined(editAddress);
    const nextNotes = toNullableOrUndefined(editNotes);

    if (nextName !== undefined) {
      updates.name = nextName;
    }
    if (nextSurname !== undefined) {
      updates.surname = nextSurname;
    }
    if (nextIdNumber !== undefined) {
      updates.idNumber = nextIdNumber;
    }
    if (nextPhone !== undefined) {
      updates.phone = nextPhone;
    }
    if (nextAddress !== undefined) {
      updates.address = nextAddress;
    }
    if (nextNotes !== undefined) {
      updates.notes = nextNotes;
    }

    if (Object.keys(updates).length === 0) {
      setEditError("Enter at least one field to update");
      return;
    }

    setEditPending(true);
    setEditError(null);
    try {
      await queue.enqueue(buildUpdatePersonEvent(sessionUser, selectedPerson.id, updates));
      await sync.syncNow();
      await loadPeople(search);
      setEditName("");
      setEditSurname("");
      setEditIdNumber("");
      setEditPhone("");
      setEditAddress("");
      setEditNotes("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEditError(message);
    } finally {
      setEditPending(false);
    }
  };

  const handleRecordIntake = async (): Promise<void> => {
    if (queue === null || sessionUser === null) {
      setIntakeError("Queue is unavailable");
      return;
    }
    if (intakePersonId === null) {
      setIntakeError("Person is required");
      return;
    }
    if (intakeLines.length === 0) {
      setIntakeError("Add at least one intake line");
      return;
    }

    const seenMaterialIds = new Set<string>();
    const lines: IntakeEventLineInput[] = [];

    for (const line of intakeLines) {
      if (line.materialTypeId === null) {
        setIntakeError("Each line must include a material");
        return;
      }
      if (seenMaterialIds.has(line.materialTypeId)) {
        setIntakeError("Duplicate materials are not allowed");
        return;
      }
      const material = materials.find((entry) => entry.id === line.materialTypeId) ?? null;
      if (material === null) {
        setIntakeError("Material not found");
        return;
      }
      const weight = Number.parseFloat(line.weightKg);
      if (!Number.isFinite(weight) || weight <= 0) {
        setIntakeError("Each line weight must be greater than 0");
        return;
      }
      seenMaterialIds.add(line.materialTypeId);
      lines.push({
        materialTypeId: line.materialTypeId,
        weightKg: weight,
        pointsPerKg: material.pointsPerKg,
      });
    }

    if (lines.length === 0) {
      setIntakeError("Add at least one intake line");
      return;
    }

    setIntakePending(true);
    setIntakeError(null);
    try {
      await queue.enqueue(
        buildIntakeRecordedEvent(sessionUser, {
          personId: intakePersonId,
          lines,
        }),
      );
      await sync.syncNow();
      await loadLedger(intakePersonId);
      setLedgerPersonId(intakePersonId);
      setIntakeLines([createIntakeDraftLine(materials[0]?.id ?? null)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setIntakeError(message);
    } finally {
      setIntakePending(false);
    }
  };

  const handleRecordSale = async (): Promise<void> => {
    if (!canRecordSales) {
      setSaleError("You do not have permission to record sales");
      return;
    }
    if (queue === null || sessionUser === null) {
      setSaleError("Queue is unavailable");
      return;
    }
    if (salePersonId === null) {
      setSaleError("Person is required");
      return;
    }
    if (saleLines.length === 0) {
      setSaleError("Add at least one sale line");
      return;
    }

    const availableByBatch = new Map<string, number>();
    for (const batch of inventoryBatches) {
      availableByBatch.set(batch.inventoryBatchId, batch.quantities.shop);
    }

    const eventLines: SaleEventLineInput[] = [];
    for (const line of saleLines) {
      if (line.itemId === null) {
        setSaleError("Each line must include an item");
        return;
      }
      const item = items.find((entry) => entry.id === line.itemId) ?? null;
      if (item === null) {
        setSaleError("Item not found");
        return;
      }
      const quantity = Number.parseInt(line.quantity, 10);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setSaleError("Each line quantity must be a positive integer");
        return;
      }

      if (line.inventoryBatchId !== null) {
        const selectedBatch =
          inventoryBatches.find((entry) => entry.inventoryBatchId === line.inventoryBatchId) ??
          null;
        if (selectedBatch === null) {
          setSaleError("Selected inventory batch was not found");
          return;
        }
        if (selectedBatch.itemId !== line.itemId) {
          setSaleError("Selected batch does not match the selected item");
          return;
        }
        const available = availableByBatch.get(selectedBatch.inventoryBatchId) ?? 0;
        if (available < quantity) {
          setSaleError("Requested sale quantity exceeds available shop stock");
          return;
        }
        availableByBatch.set(selectedBatch.inventoryBatchId, available - quantity);
        eventLines.push({
          itemId: line.itemId,
          inventoryBatchId: selectedBatch.inventoryBatchId,
          quantity,
          pointsPrice: item.pointsPrice,
        });
        continue;
      }

      const candidateBatches = inventoryBatches.filter((entry) => entry.itemId === line.itemId);
      let remaining = quantity;
      for (const batch of candidateBatches) {
        if (remaining <= 0) {
          break;
        }
        const available = availableByBatch.get(batch.inventoryBatchId) ?? 0;
        if (available <= 0) {
          continue;
        }
        const allocated = Math.min(available, remaining);
        eventLines.push({
          itemId: line.itemId,
          inventoryBatchId: batch.inventoryBatchId,
          quantity: allocated,
          pointsPrice: item.pointsPrice,
        });
        availableByBatch.set(batch.inventoryBatchId, available - allocated);
        remaining -= allocated;
      }
      if (remaining > 0) {
        setSaleError("Not enough shop stock for one or more sale lines");
        return;
      }
    }

    if (eventLines.length === 0) {
      setSaleError("Add at least one sale line");
      return;
    }

    setSalePending(true);
    setSaleError(null);
    try {
      await queue.enqueue(
        buildSaleRecordedEvent(sessionUser, {
          personId: salePersonId,
          lines: eventLines,
        }),
      );
      await sync.syncNow();
      await Promise.all([loadInventory(), loadLedger(salePersonId)]);
      setLedgerPersonId(salePersonId);
      setSaleLines([createSaleDraftLine(items[0]?.id ?? null)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaleError(message);
    } finally {
      setSalePending(false);
    }
  };

  const handleRecordProcurement = async (): Promise<void> => {
    if (!canRecordProcurement) {
      setProcurementError("You do not have permission to record procurement");
      return;
    }
    if (queue === null || sessionUser === null) {
      setProcurementError("Queue is unavailable");
      return;
    }
    if (procurementLines.length === 0) {
      setProcurementError("Add at least one procurement line");
      return;
    }

    const lines: ProcurementEventLineInput[] = [];
    for (const line of procurementLines) {
      if (line.itemId === null) {
        setProcurementError("Each line must include an item");
        return;
      }
      const item = items.find((entry) => entry.id === line.itemId) ?? null;
      if (item === null) {
        setProcurementError("Item not found");
        return;
      }
      const quantity = Number.parseInt(line.quantity, 10);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setProcurementError("Each line quantity must be a positive integer");
        return;
      }
      const unitCost = Number.parseFloat(line.unitCost);
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        setProcurementError("Each line unit cost must be 0 or greater");
        return;
      }
      lines.push({
        itemId: item.id,
        inventoryBatchId: crypto.randomUUID(),
        quantity,
        unitCost,
      });
    }
    if (lines.length === 0) {
      setProcurementError("Add at least one procurement line");
      return;
    }

    const tripDistance =
      procurementTripDistanceKm.trim().length === 0
        ? null
        : Number.parseFloat(procurementTripDistanceKm);
    if (tripDistance !== null && (!Number.isFinite(tripDistance) || tripDistance < 0)) {
      setProcurementError("Trip distance must be 0 or greater");
      return;
    }

    setProcurementPending(true);
    setProcurementError(null);
    try {
      await queue.enqueue(
        buildProcurementRecordedEvent(sessionUser, {
          supplierName: toNullableOrUndefined(procurementSupplierName) ?? null,
          tripDistanceKm: tripDistance,
          lines,
        }),
      );
      await sync.syncNow();
      await loadInventory();
      setProcurementLines([createProcurementDraftLine(items[0]?.id ?? null)]);
      setProcurementSupplierName("");
      setProcurementTripDistanceKm("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProcurementError(message);
    } finally {
      setProcurementPending(false);
    }
  };

  const handleRecordExpense = async (): Promise<void> => {
    if (!canRecordExpenses) {
      setExpenseError("You do not have permission to record expenses");
      return;
    }
    if (queue === null || sessionUser === null) {
      setExpenseError("Queue is unavailable");
      return;
    }
    const category = expenseCategory.trim();
    if (category.length === 0) {
      setExpenseError("Category is required");
      return;
    }
    const cashAmount = Number.parseFloat(expenseCashAmount);
    if (!Number.isFinite(cashAmount) || cashAmount < 0) {
      setExpenseError("Cash amount must be 0 or greater");
      return;
    }

    setExpensePending(true);
    setExpenseError(null);
    try {
      await queue.enqueue(
        buildExpenseRecordedEvent(sessionUser, {
          category,
          cashAmount,
          notes: toNullableOrUndefined(expenseNotes) ?? null,
          receiptRef: toNullableOrUndefined(expenseReceiptRef) ?? null,
        }),
      );
      await sync.syncNow();
      await loadInventory();
      if (ledgerPersonId !== null) {
        await loadLedger(ledgerPersonId);
      }
      setExpenseCategory("");
      setExpenseCashAmount("");
      setExpenseNotes("");
      setExpenseReceiptRef("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExpenseError(message);
    } finally {
      setExpensePending(false);
    }
  };

  const handleInventoryStatusChange = async (): Promise<void> => {
    if (queue === null || sessionUser === null) {
      setStatusChangeError("Queue is unavailable");
      return;
    }
    if (statusChangeBatchId === null) {
      setStatusChangeError("Inventory batch is required");
      return;
    }
    if (statusChangeFromStatus === statusChangeToStatus) {
      setStatusChangeError("From status and to status must differ");
      return;
    }
    const quantity = Number.parseInt(statusChangeQuantity, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setStatusChangeError("Quantity must be a positive integer");
      return;
    }
    const batch =
      inventoryBatches.find((entry) => entry.inventoryBatchId === statusChangeBatchId) ?? null;
    if (batch === null) {
      setStatusChangeError("Inventory batch not found");
      return;
    }
    const available = batch.quantities[statusChangeFromStatus];
    if (available < quantity) {
      setStatusChangeError("Requested quantity exceeds available stock");
      return;
    }
    setStatusChangePending(true);
    setStatusChangeError(null);
    try {
      await queue.enqueue(
        buildInventoryStatusChangedEvent(sessionUser, {
          inventoryBatchId: statusChangeBatchId,
          fromStatus: statusChangeFromStatus,
          toStatus: statusChangeToStatus,
          quantity,
          reason: toNullableOrUndefined(statusChangeReason) ?? null,
          notes: toNullableOrUndefined(statusChangeNotes) ?? null,
        }),
      );
      await sync.syncNow();
      await loadInventory();
      setStatusChangeQuantity("");
      setStatusChangeReason("");
      setStatusChangeNotes("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusChangeError(message);
    } finally {
      setStatusChangePending(false);
    }
  };

  const handleInventoryAdjustmentRequest = async (): Promise<void> => {
    if (queue === null || sessionUser === null) {
      setAdjustmentError("Queue is unavailable");
      return;
    }
    if (adjustmentBatchId === null) {
      setAdjustmentError("Inventory batch is required");
      return;
    }
    const quantity = Number.parseInt(adjustmentQuantity, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setAdjustmentError("Quantity must be a positive integer");
      return;
    }
    if (adjustmentReason.trim().length === 0) {
      setAdjustmentError("Reason is required");
      return;
    }
    setAdjustmentPending(true);
    setAdjustmentError(null);
    try {
      await queue.enqueue(
        buildInventoryAdjustmentRequestedEvent(sessionUser, {
          inventoryBatchId: adjustmentBatchId,
          requestedStatus: adjustmentStatus,
          quantity,
          reason: adjustmentReason.trim(),
          notes: toNullableOrUndefined(adjustmentNotes) ?? null,
        }),
      );
      await sync.syncNow();
      await loadInventory();
      setAdjustmentQuantity("");
      setAdjustmentReason("");
      setAdjustmentNotes("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAdjustmentError(message);
    } finally {
      setAdjustmentPending(false);
    }
  };

  if (sessionStatus !== "authenticated") {
    return (
      <AppShell padding="md">
        <AppShell.Main className="mainSurface">
          <Container size="sm" py="xl">
            <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
              <Stack gap="md">
                <Title order={3}>Login</Title>
                <TextInput
                  label="Username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.currentTarget.value);
                  }}
                />
                <PasswordInput
                  label="Passcode"
                  value={passcode}
                  onChange={(event) => {
                    setPasscode(event.currentTarget.value);
                  }}
                />
                {sessionError !== null ? <Text c="red">{sessionError}</Text> : null}
                <Button
                  onClick={() => {
                    void handleLogin();
                  }}
                  loading={loginPending || sessionStatus === "loading"}
                >
                  Login
                </Button>
              </Stack>
            </Card>
          </Container>
        </AppShell.Main>
      </AppShell>
    );
  }

  return (
    <AppShell
      header={{
        height: 68,
      }}
      padding="md"
    >
      <AppShell.Header className="topBar">
        <Group justify="space-between" px="md" h="100%">
          <Group gap="sm">
            <Text fw={700} size="lg">
              Recycling Swap-Shop
            </Text>
            <Badge color="green">Phase 3 Task 6</Badge>
            <Badge color={syncBadgeColor(sync.status)}>{`Sync ${sync.status}`}</Badge>
          </Group>
          <Group gap="xs">
            <Text
              size="sm"
              c="dimmed"
            >{`${sessionUser?.username ?? "unknown"} (${sessionUser?.role ?? "unknown"})`}</Text>
            <Button
              variant="light"
              size="xs"
              onClick={() => {
                void sync.syncNow();
              }}
              loading={sync.status === "running"}
              disabled={queue === null || syncStateStore === null}
            >
              Sync Now
            </Button>
            <Button variant="default" size="xs" onClick={handleLogout}>
              Logout
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main className="mainSurface">
        <Container size="lg">
          <Stack gap="xl" py="xl">
            <div>
              <Title order={2}>Person Registry</Title>
              <Text c="dimmed" size="sm">{`Pending events: ${String(sync.pendingCount)}`}</Text>
              <Text c="dimmed" size="sm">{`Last sync: ${sync.lastSyncAt ?? "never"}`}</Text>
              {sync.errorMessage !== null ? (
                <Text c="red" size="sm">{`Sync error: ${sync.errorMessage}`}</Text>
              ) : null}
              {materialsError !== null ? (
                <Text c="red" size="sm">{`Materials error: ${materialsError}`}</Text>
              ) : null}
              {itemsError !== null ? (
                <Text c="red" size="sm">{`Items error: ${itemsError}`}</Text>
              ) : null}
            </div>
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Title order={4}>Search People</Title>
                  <Group align="flex-end">
                    <TextInput
                      label="Search"
                      placeholder="Name or surname"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.currentTarget.value);
                      }}
                    />
                    <Button
                      onClick={() => {
                        void loadPeople(search);
                      }}
                      loading={peopleLoading}
                    >
                      Search
                    </Button>
                  </Group>
                  {peopleError !== null ? <Text c="red">{peopleError}</Text> : null}
                  <Stack gap="xs">
                    {people.map((person) => (
                      <Card key={person.id} withBorder radius="md" padding="sm">
                        <Stack gap={2}>
                          <Text fw={600}>{`${person.name} ${person.surname}`}</Text>
                          <Text
                            size="sm"
                            c="dimmed"
                          >{`ID: ${maskSensitiveValue(person.idNumber)}`}</Text>
                          <Text
                            size="sm"
                            c="dimmed"
                          >{`Phone: ${maskSensitiveValue(person.phone)}`}</Text>
                          <Text
                            size="xs"
                            c="dimmed"
                          >{`Address: ${person.address ?? "Not set"}`}</Text>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => {
                              setSelectedPersonId(person.id);
                            }}
                          >
                            Edit
                          </Button>
                        </Stack>
                      </Card>
                    ))}
                    {people.length === 0 && !peopleLoading ? (
                      <Text size="sm" c="dimmed">
                        No people found.
                      </Text>
                    ) : null}
                  </Stack>
                </Stack>
              </Card>

              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Title order={4}>Create Person</Title>
                  <TextInput
                    label="Name"
                    value={createName}
                    onChange={(event) => {
                      setCreateName(event.currentTarget.value);
                    }}
                  />
                  <TextInput
                    label="Surname"
                    value={createSurname}
                    onChange={(event) => {
                      setCreateSurname(event.currentTarget.value);
                    }}
                  />
                  <TextInput
                    label="ID Number"
                    value={createIdNumber}
                    onChange={(event) => {
                      setCreateIdNumber(event.currentTarget.value);
                    }}
                  />
                  <TextInput
                    label="Phone"
                    value={createPhone}
                    onChange={(event) => {
                      setCreatePhone(event.currentTarget.value);
                    }}
                  />
                  <TextInput
                    label="Address"
                    value={createAddress}
                    onChange={(event) => {
                      setCreateAddress(event.currentTarget.value);
                    }}
                  />
                  <Textarea
                    label="Notes"
                    value={createNotes}
                    onChange={(event) => {
                      setCreateNotes(event.currentTarget.value);
                    }}
                  />
                  {createError !== null ? <Text c="red">{createError}</Text> : null}
                  <Button
                    onClick={() => {
                      void handleCreate();
                    }}
                    loading={createPending}
                  >
                    Save Person
                  </Button>
                </Stack>
              </Card>
            </SimpleGrid>

            {canRecordSales ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Title order={4}>Edit Person</Title>
                  {selectedPerson === null ? (
                    <Text size="sm" c="dimmed">
                      Select a person from the list to edit.
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      <Text size="sm">{`${selectedPerson.name} ${selectedPerson.surname}`}</Text>
                      <Text
                        size="sm"
                        c="dimmed"
                      >{`ID: ${maskSensitiveValue(selectedPerson.idNumber)}`}</Text>
                      <Text
                        size="sm"
                        c="dimmed"
                      >{`Phone: ${maskSensitiveValue(selectedPerson.phone)}`}</Text>
                      <Divider />
                      <Text size="xs" c="dimmed">
                        Enter only fields you want to change. Existing ID/phone stay masked by
                        default.
                      </Text>
                      <TextInput
                        label="Name"
                        value={editName}
                        onChange={(event) => {
                          setEditName(event.currentTarget.value);
                        }}
                      />
                      <TextInput
                        label="Surname"
                        value={editSurname}
                        onChange={(event) => {
                          setEditSurname(event.currentTarget.value);
                        }}
                      />
                      <TextInput
                        label="ID Number"
                        value={editIdNumber}
                        onChange={(event) => {
                          setEditIdNumber(event.currentTarget.value);
                        }}
                      />
                      <TextInput
                        label="Phone"
                        value={editPhone}
                        onChange={(event) => {
                          setEditPhone(event.currentTarget.value);
                        }}
                      />
                      <TextInput
                        label="Address"
                        value={editAddress}
                        onChange={(event) => {
                          setEditAddress(event.currentTarget.value);
                        }}
                      />
                      <Textarea
                        label="Notes"
                        value={editNotes}
                        onChange={(event) => {
                          setEditNotes(event.currentTarget.value);
                        }}
                      />
                      {editError !== null ? <Text c="red">{editError}</Text> : null}
                      <Button
                        onClick={() => {
                          void handleEdit();
                        }}
                        loading={editPending}
                      >
                        Save Changes
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Card>
            ) : null}

            {canRecordProcurement ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Title order={4}>Record Procurement</Title>
                  <TextInput
                    label="Supplier Name"
                    value={procurementSupplierName}
                    onChange={(event) => {
                      setProcurementSupplierName(event.currentTarget.value);
                    }}
                  />
                  <TextInput
                    label="Trip Distance Km"
                    value={procurementTripDistanceKm}
                    onChange={(event) => {
                      setProcurementTripDistanceKm(event.currentTarget.value);
                    }}
                  />
                  {procurementLines.map((line, index) => (
                    <Card key={line.lineId} withBorder radius="md" padding="sm">
                      <Stack gap="xs">
                        <Select
                          label={`Procurement Item ${String(index + 1)}`}
                          data={items.map((item) => ({
                            value: item.id,
                            label: `${item.name} (${String(item.pointsPrice)} pts)`,
                          }))}
                          value={line.itemId}
                          onChange={(value) => {
                            setProcurementLines((previous) =>
                              previous.map((entry) =>
                                entry.lineId === line.lineId
                                  ? {
                                      ...entry,
                                      itemId: value,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                          searchable
                          clearable
                          disabled={itemsLoading}
                        />
                        <TextInput
                          label={`Procurement Quantity ${String(index + 1)}`}
                          value={line.quantity}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setProcurementLines((previous) =>
                              previous.map((entry) =>
                                entry.lineId === line.lineId
                                  ? {
                                      ...entry,
                                      quantity: nextValue,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                        />
                        <TextInput
                          label={`Unit Cost ${String(index + 1)}`}
                          value={line.unitCost}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setProcurementLines((previous) =>
                              previous.map((entry) =>
                                entry.lineId === line.lineId
                                  ? {
                                      ...entry,
                                      unitCost: nextValue,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                        />
                        <Button
                          variant="default"
                          size="xs"
                          onClick={() => {
                            setProcurementLines((previous) =>
                              previous.filter((entry) => entry.lineId !== line.lineId),
                            );
                          }}
                        >
                          Remove Procurement Line
                        </Button>
                      </Stack>
                    </Card>
                  ))}
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      setProcurementLines((previous) => [
                        ...previous,
                        createProcurementDraftLine(items[0]?.id ?? null),
                      ]);
                    }}
                  >
                    Add Procurement Line
                  </Button>
                  <Text size="sm" c="dimmed">
                    {`Procurement total preview cash: ${String(procurementTotalPreviewCost)}`}
                  </Text>
                  {procurementError !== null ? <Text c="red">{procurementError}</Text> : null}
                  <Button
                    onClick={() => {
                      void handleRecordProcurement();
                    }}
                    loading={procurementPending}
                  >
                    Record Procurement
                  </Button>
                </Stack>
              </Card>
            ) : null}

            {canRecordExpenses ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Title order={4}>Record Expense</Title>
                  <TextInput
                    label="Expense Category"
                    value={expenseCategory}
                    onChange={(event) => {
                      setExpenseCategory(event.currentTarget.value);
                    }}
                  />
                  <TextInput
                    label="Expense Cash Amount"
                    value={expenseCashAmount}
                    onChange={(event) => {
                      setExpenseCashAmount(event.currentTarget.value);
                    }}
                  />
                  <Textarea
                    label="Expense Notes"
                    value={expenseNotes}
                    onChange={(event) => {
                      setExpenseNotes(event.currentTarget.value);
                    }}
                  />
                  <TextInput
                    label="Expense Receipt Ref"
                    value={expenseReceiptRef}
                    onChange={(event) => {
                      setExpenseReceiptRef(event.currentTarget.value);
                    }}
                  />
                  {expenseError !== null ? <Text c="red">{expenseError}</Text> : null}
                  <Button
                    onClick={() => {
                      void handleRecordExpense();
                    }}
                    loading={expensePending}
                  >
                    Record Expense
                  </Button>
                </Stack>
              </Card>
            ) : null}

            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Title order={4}>Record Intake</Title>
                  <Select
                    label="Person"
                    data={people.map((person) => ({
                      value: person.id,
                      label: `${person.name} ${person.surname}`,
                    }))}
                    value={intakePersonId}
                    onChange={setIntakePersonId}
                    searchable
                    clearable
                  />
                  {intakeLines.map((line, index) => (
                    <Card key={line.lineId} withBorder radius="md" padding="sm">
                      <Stack gap="xs">
                        <Select
                          label={`Material ${String(index + 1)}`}
                          data={materials.map((material) => ({
                            value: material.id,
                            label: `${material.name} (${String(material.pointsPerKg)} pts/kg)`,
                          }))}
                          value={line.materialTypeId}
                          onChange={(nextValue) => {
                            setIntakeLines((previous) =>
                              previous.map((entry) =>
                                entry.lineId === line.lineId
                                  ? {
                                      ...entry,
                                      materialTypeId: nextValue,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                          searchable
                          clearable
                          disabled={materialsLoading}
                        />
                        <TextInput
                          label={`Weight Kg ${String(index + 1)}`}
                          placeholder="e.g. 2.9"
                          value={line.weightKg}
                          onChange={(event) => {
                            const nextWeight = event.currentTarget.value;
                            setIntakeLines((previous) =>
                              previous.map((entry) =>
                                entry.lineId === line.lineId
                                  ? {
                                      ...entry,
                                      weightKg: nextWeight,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                        />
                        <Text size="sm" c="dimmed">
                          {`Line ${String(index + 1)} points: ${intakeLinePreviews[index] ?? "-"}`}
                        </Text>
                        <Button
                          variant="default"
                          size="xs"
                          onClick={() => {
                            setIntakeLines((previous) =>
                              previous.filter((entry) => entry.lineId !== line.lineId),
                            );
                          }}
                        >
                          Remove Line
                        </Button>
                      </Stack>
                    </Card>
                  ))}
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      setIntakeLines((previous) => [
                        ...previous,
                        createIntakeDraftLine(materials[0]?.id ?? null),
                      ]);
                    }}
                  >
                    Add Line
                  </Button>
                  <Text size="sm" c="dimmed">
                    {`Total preview points: ${String(intakeTotalPreviewPoints)}`}
                  </Text>
                  {intakeError !== null ? <Text c="red">{intakeError}</Text> : null}
                  <Button
                    onClick={() => {
                      void handleRecordIntake();
                    }}
                    loading={intakePending}
                  >
                    Record Intake
                  </Button>
                </Stack>
              </Card>

              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Title order={4}>Points Ledger</Title>
                  <Group align="flex-end">
                    <Select
                      label="Ledger Person"
                      data={people.map((person) => ({
                        value: person.id,
                        label: `${person.name} ${person.surname}`,
                      }))}
                      value={ledgerPersonId}
                      onChange={setLedgerPersonId}
                      searchable
                    />
                    <Button
                      onClick={() => {
                        if (ledgerPersonId !== null) {
                          void loadLedger(ledgerPersonId);
                        }
                      }}
                      loading={ledgerLoading}
                      disabled={ledgerPersonId === null}
                    >
                      Refresh Ledger
                    </Button>
                  </Group>
                  {ledgerError !== null ? <Text c="red">{ledgerError}</Text> : null}
                  <Text size="sm" c="dimmed">
                    {`Balance: ${ledgerBalance === null ? "-" : String(ledgerBalance.balancePoints)}`}
                  </Text>
                  <Stack gap="xs">
                    {ledgerEntries.map((entry) => (
                      <Card key={entry.id} withBorder radius="md" padding="sm">
                        <Text size="sm">{`${entry.sourceEventType} | ${entry.deltaPoints > 0 ? "+" : ""}${String(entry.deltaPoints)}`}</Text>
                        <Text size="xs" c="dimmed">{`Source: ${entry.sourceEventId}`}</Text>
                        <Text size="xs" c="dimmed">
                          {entry.occurredAt}
                        </Text>
                      </Card>
                    ))}
                    {ledgerEntries.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No ledger entries loaded.
                      </Text>
                    ) : null}
                  </Stack>
                </Stack>
              </Card>
            </SimpleGrid>

            <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
              <Stack gap="sm">
                <Title order={4}>Record Sale</Title>
                <Select
                  label="Sale Person"
                  data={people.map((person) => ({
                    value: person.id,
                    label: `${person.name} ${person.surname}`,
                  }))}
                  value={salePersonId}
                  onChange={setSalePersonId}
                  searchable
                  clearable
                />
                {saleLines.map((line, index) => {
                  const lineBatches = inventoryBatches.filter(
                    (batch) => batch.itemId === line.itemId,
                  );
                  return (
                    <Card key={line.lineId} withBorder radius="md" padding="sm">
                      <Stack gap="xs">
                        <Select
                          label={`Item ${String(index + 1)}`}
                          data={items.map((item) => ({
                            value: item.id,
                            label: `${item.name} (${String(item.pointsPrice)} pts)`,
                          }))}
                          value={line.itemId}
                          onChange={(value) => {
                            setSaleLines((previous) =>
                              previous.map((entry) =>
                                entry.lineId === line.lineId
                                  ? {
                                      ...entry,
                                      itemId: value,
                                      inventoryBatchId: null,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                          searchable
                          clearable
                          disabled={itemsLoading}
                        />
                        <Select
                          label={`Batch ${String(index + 1)} (optional)`}
                          data={lineBatches.map((batch) => ({
                            value: batch.inventoryBatchId,
                            label: `${batch.inventoryBatchId} (shop ${String(batch.quantities.shop)})`,
                          }))}
                          value={line.inventoryBatchId}
                          onChange={(value) => {
                            setSaleLines((previous) =>
                              previous.map((entry) =>
                                entry.lineId === line.lineId
                                  ? {
                                      ...entry,
                                      inventoryBatchId: value,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                          searchable
                          clearable
                        />
                        <TextInput
                          label={`Quantity ${String(index + 1)}`}
                          value={line.quantity}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setSaleLines((previous) =>
                              previous.map((entry) =>
                                entry.lineId === line.lineId
                                  ? {
                                      ...entry,
                                      quantity: nextValue,
                                    }
                                  : entry,
                              ),
                            );
                          }}
                        />
                        <Button
                          variant="default"
                          size="xs"
                          onClick={() => {
                            setSaleLines((previous) =>
                              previous.filter((entry) => entry.lineId !== line.lineId),
                            );
                          }}
                        >
                          Remove Sale Line
                        </Button>
                      </Stack>
                    </Card>
                  );
                })}
                <Button
                  variant="light"
                  size="xs"
                  onClick={() => {
                    setSaleLines((previous) => [
                      ...previous,
                      createSaleDraftLine(items[0]?.id ?? null),
                    ]);
                  }}
                >
                  Add Sale Line
                </Button>
                <Text size="sm" c="dimmed">
                  {`Sale total preview points: ${String(saleTotalPreviewPoints)}`}
                </Text>
                {saleError !== null ? <Text c="red">{saleError}</Text> : null}
                <Button
                  onClick={() => {
                    void handleRecordSale();
                  }}
                  loading={salePending}
                >
                  Record Sale
                </Button>
              </Stack>
            </Card>

            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Title order={4}>Inventory Status Change</Title>
                  <Group align="flex-end">
                    <Button
                      variant="default"
                      size="xs"
                      onClick={() => {
                        void loadInventory();
                      }}
                      loading={inventoryLoading}
                    >
                      Refresh Inventory
                    </Button>
                  </Group>
                  {inventoryError !== null ? <Text c="red">{inventoryError}</Text> : null}
                  <Stack gap="xs">
                    {inventorySummary.map((entry) => (
                      <Text
                        key={entry.status}
                        size="sm"
                        c="dimmed"
                      >{`${entry.status}: ${String(entry.totalQuantity)}`}</Text>
                    ))}
                    {inventorySummary.length === 0 && !inventoryLoading ? (
                      <Text size="sm" c="dimmed">
                        No inventory summary loaded.
                      </Text>
                    ) : null}
                  </Stack>
                  <Select
                    label="Batch"
                    data={inventoryBatches.map((batch) => ({
                      value: batch.inventoryBatchId,
                      label: `${batch.inventoryBatchId}${batch.itemId !== null ? ` (${batch.itemId})` : ""}`,
                    }))}
                    value={statusChangeBatchId}
                    onChange={setStatusChangeBatchId}
                    searchable
                  />
                  <Select
                    label="From Status"
                    data={inventoryStatuses.map((status) => ({
                      value: status,
                      label: status,
                    }))}
                    value={statusChangeFromStatus}
                    onChange={(value) => {
                      if (value !== null) {
                        setStatusChangeFromStatus(value as InventoryStatus);
                      }
                    }}
                  />
                  <Select
                    label="To Status"
                    data={inventoryStatuses.map((status) => ({
                      value: status,
                      label: status,
                    }))}
                    value={statusChangeToStatus}
                    onChange={(value) => {
                      if (value !== null) {
                        setStatusChangeToStatus(value as InventoryStatus);
                      }
                    }}
                  />
                  <TextInput
                    label="Quantity"
                    value={statusChangeQuantity}
                    onChange={(event) => {
                      setStatusChangeQuantity(event.currentTarget.value);
                    }}
                  />
                  <TextInput
                    label="Reason"
                    value={statusChangeReason}
                    onChange={(event) => {
                      setStatusChangeReason(event.currentTarget.value);
                    }}
                  />
                  <Textarea
                    label="Notes"
                    value={statusChangeNotes}
                    onChange={(event) => {
                      setStatusChangeNotes(event.currentTarget.value);
                    }}
                  />
                  {statusChangeError !== null ? <Text c="red">{statusChangeError}</Text> : null}
                  <Button
                    onClick={() => {
                      void handleInventoryStatusChange();
                    }}
                    loading={statusChangePending}
                  >
                    Move Inventory
                  </Button>
                </Stack>
              </Card>

              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Title order={4}>Inventory Adjustment Request</Title>
                  <Select
                    label="Batch"
                    data={inventoryBatches.map((batch) => ({
                      value: batch.inventoryBatchId,
                      label: `${batch.inventoryBatchId}${batch.itemId !== null ? ` (${batch.itemId})` : ""}`,
                    }))}
                    value={adjustmentBatchId}
                    onChange={setAdjustmentBatchId}
                    searchable
                  />
                  <Select
                    label="Requested Status"
                    data={inventoryAdjustmentStatuses.map((status) => ({
                      value: status,
                      label: status,
                    }))}
                    value={adjustmentStatus}
                    onChange={(value) => {
                      if (value !== null) {
                        setAdjustmentStatus(value as InventoryAdjustmentStatus);
                      }
                    }}
                  />
                  <TextInput
                    label="Quantity"
                    value={adjustmentQuantity}
                    onChange={(event) => {
                      setAdjustmentQuantity(event.currentTarget.value);
                    }}
                  />
                  <TextInput
                    label="Reason"
                    value={adjustmentReason}
                    onChange={(event) => {
                      setAdjustmentReason(event.currentTarget.value);
                    }}
                  />
                  <Textarea
                    label="Notes"
                    value={adjustmentNotes}
                    onChange={(event) => {
                      setAdjustmentNotes(event.currentTarget.value);
                    }}
                  />
                  {adjustmentError !== null ? <Text c="red">{adjustmentError}</Text> : null}
                  <Button
                    onClick={() => {
                      void handleInventoryAdjustmentRequest();
                    }}
                    loading={adjustmentPending}
                  >
                    Submit Adjustment Request
                  </Button>
                </Stack>
              </Card>
            </SimpleGrid>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
};
