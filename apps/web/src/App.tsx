import {
  Alert,
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
import { useEffect, useMemo, useRef, useState } from "react";
import type { Event } from "../../../packages/shared/src/domain/events";
import {
  floorPointsToTenths,
  formatPointValue,
  multiplyPointValue,
  sumPointValues,
} from "../../../packages/shared/src/domain/points";
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
import { downloadCsv, type CsvRow } from "./offline/report-export";
import {
  type CashflowReportResponse,
  type CashflowReportRow,
  type CashflowExpenseCategoryRow,
  createReportsClient,
  type InventoryStatusLogReportResponse,
  type InventoryStatusLogReportRow,
  type InventoryStatusReportRow,
  type InventoryStatusReportSummaryRow,
  type MaterialsCollectedReportResponse,
  type MaterialsCollectedReportRow,
  type PointsLiabilityReportResponse,
  type PointsLiabilityReportRow,
  type SalesReportResponse,
  type SalesReportRow,
} from "./offline/reports-client";
import { createReconciliationClient } from "./offline/reconciliation-client";
import {
  createAdjustmentsClient,
  type AdjustmentRequestRecord,
  type InventoryStatus as AdjustmentInventoryStatus,
} from "./offline/adjustments-client";
import { createUsersClient, type StaffUserRecord } from "./offline/users-client";
import type {
  SyncReconciliationIssue,
  SyncReconciliationReportResponse,
} from "../../../packages/shared/src/domain/sync";
import type { SyncStateStore } from "./offline/sync-state-store";
import { useSync } from "./offline/use-sync";
import "./app.css";

type AppProps = {
  queue?: EventQueue | null;
  syncStateStore?: SyncStateStore | null;
  startupWarnings?: string[];
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
type ManagerPanelKey =
  | "reconciliation"
  | "materialsReport"
  | "pointsLiability"
  | "inventoryStatusReport"
  | "inventoryStatusLog"
  | "salesReport"
  | "cashflowReport";

type NavViewKey =
  | "person-search"
  | "person-create"
  | "person-edit"
  | "collection-log"
  | "shop-log"
  | "adjustments-points-request"
  | "adjustments-inventory-request"
  | "adjustments-points-apply"
  | "adjustments-inventory-apply"
  | "reporting"
  | "users-list"
  | "users-create"
  | "users-edit";

const inventoryStatuses: InventoryStatus[] = [
  "storage",
  "shop",
  "sold",
  "spoiled",
  "damaged",
  "missing",
];
const inventoryAdjustmentStatuses: InventoryAdjustmentStatus[] = ["spoiled", "damaged", "missing"];

const createClosedManagerPanels = (): Record<ManagerPanelKey, boolean> => ({
  reconciliation: false,
  materialsReport: false,
  pointsLiability: false,
  inventoryStatusReport: false,
  inventoryStatusLog: false,
  salesReport: false,
  cashflowReport: false,
});

const formatCurrencyValue = (value: number): string => value.toFixed(2);

const buildMaterialsReportExportRows = (rows: MaterialsCollectedReportRow[]): CsvRow[] =>
  rows.map((row) => ({
    day: row.day,
    materialTypeId: row.materialTypeId,
    materialName: row.materialName,
    locationText: row.locationText,
    totalWeightKg: row.totalWeightKg,
    totalPoints: row.totalPoints,
  }));

const buildPointsLiabilityExportRows = (rows: PointsLiabilityReportRow[]): CsvRow[] =>
  rows.map((row) => ({
    personId: row.personId,
    name: row.name,
    surname: row.surname,
    balancePoints: row.balancePoints,
  }));

const buildInventoryStatusExportRows = (
  summaryRows: InventoryStatusReportSummaryRow[],
  detailRows: InventoryStatusReportRow[],
): CsvRow[] => [
  ...summaryRows.map((row) => ({
    section: "summary",
    status: row.status,
    totalQuantity: row.totalQuantity,
    totalCostValue: row.totalCostValue,
  })),
  ...detailRows.map((row) => ({
    section: "detail",
    status: row.status,
    itemId: row.itemId,
    itemName: row.itemName,
    quantity: row.quantity,
    unitCost: row.unitCost,
    totalCostValue: row.totalCostValue,
  })),
];

const buildInventoryStatusLogExportRows = (rows: InventoryStatusLogReportRow[]): CsvRow[] =>
  rows.map((row) => ({
    eventId: row.eventId,
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    inventoryBatchId: row.inventoryBatchId,
    itemId: row.itemId,
    itemName: row.itemName,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    quantity: row.quantity,
    reason: row.reason,
    notes: row.notes,
  }));

const buildSalesReportExportRows = (rows: SalesReportRow[]): CsvRow[] =>
  rows.map((row) => ({
    day: row.day,
    itemId: row.itemId,
    itemName: row.itemName,
    locationText: row.locationText,
    totalQuantity: row.totalQuantity,
    totalPoints: row.totalPoints,
    saleCount: row.saleCount,
  }));

const buildCashflowExportRows = (
  rows: CashflowReportRow[],
  expenseCategories: CashflowExpenseCategoryRow[],
): CsvRow[] => [
  ...rows.map((row) => ({
    section: "daily",
    day: row.day,
    salesPointsValue: row.salesPointsValue,
    expenseCashTotal: row.expenseCashTotal,
    netCashflow: row.netCashflow,
    saleCount: row.saleCount,
    expenseCount: row.expenseCount,
  })),
  ...expenseCategories.map((row) => ({
    section: "expense_category",
    category: row.category,
    totalCashAmount: row.totalCashAmount,
    expenseCount: row.expenseCount,
  })),
];

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
    pointsAwarded: floorPointsToTenths(line.weightKg * line.pointsPerKg),
  }));
  const totalPoints = sumPointValues(lines.map((line) => line.pointsAwarded));
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
    lineTotalPoints: multiplyPointValue(line.pointsPrice, line.quantity),
  }));
  const totalPoints = sumPointValues(lines.map((line) => line.lineTotalPoints));
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

export const App = ({
  queue = null,
  syncStateStore = null,
  startupWarnings = [],
}: AppProps): JSX.Element => {
  const authClient = useMemo(() => createAuthClient(), []);
  const peopleClient = useMemo(() => createPeopleClient(), []);
  const materialsClient = useMemo(() => createMaterialsClient(), []);
  const itemsClient = useMemo(() => createItemsClient(), []);
  const inventoryClient = useMemo(() => createInventoryClient(), []);
  const ledgerClient = useMemo(() => createLedgerClient(), []);
  const reportsClient = useMemo(() => createReportsClient(), []);
  const reconciliationClient = useMemo(() => createReconciliationClient(), []);
  const adjustmentsClient = useMemo(() => createAdjustmentsClient(), []);
  const usersClient = useMemo(() => createUsersClient(), []);

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
  const [materialsReportFromDate, setMaterialsReportFromDate] = useState<string>("");
  const [materialsReportToDate, setMaterialsReportToDate] = useState<string>("");
  const [materialsReportLocationText, setMaterialsReportLocationText] = useState<string>("");
  const [materialsReportMaterialTypeId, setMaterialsReportMaterialTypeId] = useState<string | null>(
    null,
  );
  const [materialsReportRows, setMaterialsReportRows] = useState<MaterialsCollectedReportRow[]>([]);
  const [materialsReportAppliedFilters, setMaterialsReportAppliedFilters] = useState<
    MaterialsCollectedReportResponse["appliedFilters"] | null
  >(null);
  const [materialsReportLoading, setMaterialsReportLoading] = useState<boolean>(false);
  const [materialsReportError, setMaterialsReportError] = useState<string | null>(null);
  const materialsReportRequestRef = useRef<number>(0);
  const [pointsLiabilitySearch, setPointsLiabilitySearch] = useState<string>("");
  const [pointsLiabilityRows, setPointsLiabilityRows] = useState<PointsLiabilityReportRow[]>([]);
  const [pointsLiabilitySummary, setPointsLiabilitySummary] = useState<
    PointsLiabilityReportResponse["summary"] | null
  >(null);
  const [pointsLiabilityAppliedFilters, setPointsLiabilityAppliedFilters] = useState<
    PointsLiabilityReportResponse["appliedFilters"] | null
  >(null);
  const [pointsLiabilityLoading, setPointsLiabilityLoading] = useState<boolean>(false);
  const [pointsLiabilityError, setPointsLiabilityError] = useState<string | null>(null);
  const startupWarningBanner =
    startupWarnings.length > 0 ? (
      <Alert color="yellow" title="Offline storage fallback active" variant="light">
        {startupWarnings.join(" ")}
      </Alert>
    ) : null;
  const pointsLiabilityRequestRef = useRef<number>(0);
  const [inventoryStatusReportSummary, setInventoryStatusReportSummary] = useState<
    InventoryStatusReportSummaryRow[]
  >([]);
  const [inventoryStatusReportRows, setInventoryStatusReportRows] = useState<
    InventoryStatusReportRow[]
  >([]);
  const [inventoryStatusReportLoading, setInventoryStatusReportLoading] = useState<boolean>(false);
  const [inventoryStatusReportError, setInventoryStatusReportError] = useState<string | null>(null);
  const inventoryStatusReportRequestRef = useRef<number>(0);
  const [inventoryStatusLogFromDate, setInventoryStatusLogFromDate] = useState<string>("");
  const [inventoryStatusLogToDate, setInventoryStatusLogToDate] = useState<string>("");
  const [inventoryStatusLogFromStatus, setInventoryStatusLogFromStatus] =
    useState<InventoryStatus | null>(null);
  const [inventoryStatusLogToStatus, setInventoryStatusLogToStatus] =
    useState<InventoryStatus | null>(null);
  const [inventoryStatusLogRows, setInventoryStatusLogRows] = useState<
    InventoryStatusLogReportRow[]
  >([]);
  const [inventoryStatusLogAppliedFilters, setInventoryStatusLogAppliedFilters] = useState<
    InventoryStatusLogReportResponse["appliedFilters"] | null
  >(null);
  const [inventoryStatusLogLoading, setInventoryStatusLogLoading] = useState<boolean>(false);
  const [inventoryStatusLogError, setInventoryStatusLogError] = useState<string | null>(null);
  const inventoryStatusLogRequestRef = useRef<number>(0);
  const [salesReportFromDate, setSalesReportFromDate] = useState<string>("");
  const [salesReportToDate, setSalesReportToDate] = useState<string>("");
  const [salesReportItemId, setSalesReportItemId] = useState<string | null>(null);
  const [salesReportLocationText, setSalesReportLocationText] = useState<string>("");
  const [salesReportRows, setSalesReportRows] = useState<SalesReportRow[]>([]);
  const [salesReportSummary, setSalesReportSummary] = useState<
    SalesReportResponse["summary"] | null
  >(null);
  const [salesReportAppliedFilters, setSalesReportAppliedFilters] = useState<
    SalesReportResponse["appliedFilters"] | null
  >(null);
  const [salesReportLoading, setSalesReportLoading] = useState<boolean>(false);
  const [salesReportError, setSalesReportError] = useState<string | null>(null);
  const salesReportRequestRef = useRef<number>(0);
  const [cashflowReportFromDate, setCashflowReportFromDate] = useState<string>("");
  const [cashflowReportToDate, setCashflowReportToDate] = useState<string>("");
  const [cashflowReportLocationText, setCashflowReportLocationText] = useState<string>("");
  const [cashflowReportRows, setCashflowReportRows] = useState<CashflowReportRow[]>([]);
  const [cashflowReportSummary, setCashflowReportSummary] = useState<
    CashflowReportResponse["summary"] | null
  >(null);
  const [cashflowReportExpenseCategories, setCashflowReportExpenseCategories] = useState<
    CashflowExpenseCategoryRow[]
  >([]);
  const [cashflowReportAppliedFilters, setCashflowReportAppliedFilters] = useState<
    CashflowReportResponse["appliedFilters"] | null
  >(null);
  const [cashflowReportLoading, setCashflowReportLoading] = useState<boolean>(false);
  const [cashflowReportError, setCashflowReportError] = useState<string | null>(null);
  const cashflowReportRequestRef = useRef<number>(0);
  const [reconciliationIssues, setReconciliationIssues] = useState<SyncReconciliationIssue[]>([]);
  const [reconciliationSummary, setReconciliationSummary] = useState<
    SyncReconciliationReportResponse["summary"] | null
  >(null);
  const [reconciliationNextCursor, setReconciliationNextCursor] = useState<string | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState<boolean>(false);
  const [reconciliationLoadingMore, setReconciliationLoadingMore] = useState<boolean>(false);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [reconciliationSelectedIssueId, setReconciliationSelectedIssueId] = useState<string | null>(
    null,
  );
  const [reconciliationRepairNotes, setReconciliationRepairNotes] = useState<string>("");
  const [reconciliationRepairPending, setReconciliationRepairPending] = useState<boolean>(false);
  const [reconciliationRepairError, setReconciliationRepairError] = useState<string | null>(null);
  const reconciliationRequestRef = useRef<number>(0);
  const [openManagerPanels, setOpenManagerPanels] =
    useState<Record<ManagerPanelKey, boolean>>(createClosedManagerPanels);
  const [loadedManagerPanels, setLoadedManagerPanels] =
    useState<Record<ManagerPanelKey, boolean>>(createClosedManagerPanels);

  const [ledgerPersonId, setLedgerPersonId] = useState<string | null>(null);
  const [ledgerBalance, setLedgerBalance] = useState<LedgerBalance | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [, setInventorySummary] = useState<InventoryStatusSummary[]>([]);
  const [inventoryBatches, setInventoryBatches] = useState<InventoryBatchState[]>([]);
  const [, setInventoryLoading] = useState<boolean>(false);
  const [, setInventoryError] = useState<string | null>(null);
  const [statusChangeBatchId, setStatusChangeBatchId] = useState<string | null>(null);
  const [pointsAdjustmentPersonId, setPointsAdjustmentPersonId] = useState<string | null>(null);
  const [pointsAdjustmentDelta, setPointsAdjustmentDelta] = useState<string>("");
  const [pointsAdjustmentReason, setPointsAdjustmentReason] = useState<string>("");
  const [pointsAdjustmentNotes, setPointsAdjustmentNotes] = useState<string>("");
  const [pointsAdjustmentPending, setPointsAdjustmentPending] = useState<boolean>(false);
  const [pointsAdjustmentError, setPointsAdjustmentError] = useState<string | null>(null);
  const [adjustmentBatchId, setAdjustmentBatchId] = useState<string | null>(null);
  const [adjustmentStatus, setAdjustmentStatus] = useState<InventoryAdjustmentStatus>("spoiled");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState<string>("");
  const [adjustmentReason, setAdjustmentReason] = useState<string>("");
  const [adjustmentNotes, setAdjustmentNotes] = useState<string>("");
  const [adjustmentPending, setAdjustmentPending] = useState<boolean>(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<NavViewKey>("person-search");
  const [pendingAdjustmentRequests, setPendingAdjustmentRequests] = useState<
    AdjustmentRequestRecord[]
  >([]);
  const [pendingRequestsLoading, setPendingRequestsLoading] = useState<boolean>(false);
  const [pendingRequestsError, setPendingRequestsError] = useState<string | null>(null);
  const [applyPointsRequestEventId, setApplyPointsRequestEventId] = useState<string | null>(null);
  const [applyInventoryRequestEventId, setApplyInventoryRequestEventId] = useState<string | null>(
    null,
  );
  const [applyPointsPersonId, setApplyPointsPersonId] = useState<string | null>(null);
  const [applyPointsDelta, setApplyPointsDelta] = useState<string>("");
  const [applyPointsReason, setApplyPointsReason] = useState<string>("");
  const [applyPointsNotes, setApplyPointsNotes] = useState<string>("");
  const [applyPointsPending, setApplyPointsPending] = useState<boolean>(false);
  const [applyPointsError, setApplyPointsError] = useState<string | null>(null);
  const [applyInventoryBatchId, setApplyInventoryBatchId] = useState<string | null>(null);
  const [applyInventoryFromStatus, setApplyInventoryFromStatus] =
    useState<AdjustmentInventoryStatus>("shop");
  const [applyInventoryToStatus, setApplyInventoryToStatus] =
    useState<AdjustmentInventoryStatus>("damaged");
  const [applyInventoryQuantity, setApplyInventoryQuantity] = useState<string>("");
  const [applyInventoryReason, setApplyInventoryReason] = useState<string>("");
  const [applyInventoryNotes, setApplyInventoryNotes] = useState<string>("");
  const [applyInventoryPending, setApplyInventoryPending] = useState<boolean>(false);
  const [applyInventoryError, setApplyInventoryError] = useState<string | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUserRecord[]>([]);
  const [staffUsersLoading, setStaffUsersLoading] = useState<boolean>(false);
  const [staffUsersError, setStaffUsersError] = useState<string | null>(null);
  const [createUserUsername, setCreateUserUsername] = useState<string>("");
  const [createUserRole, setCreateUserRole] = useState<"user" | "administrator">("user");
  const [createUserPasscode, setCreateUserPasscode] = useState<string>("");
  const [createUserPending, setCreateUserPending] = useState<boolean>(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editUserUsername, setEditUserUsername] = useState<string>("");
  const [editUserRole, setEditUserRole] = useState<"user" | "administrator">("user");
  const [editUserPasscode, setEditUserPasscode] = useState<string>("");
  const [editUserPending, setEditUserPending] = useState<boolean>(false);
  const [editUserError, setEditUserError] = useState<string | null>(null);

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
  const canRecordSales = sessionUser?.role === "user" || sessionUser?.role === "administrator";
  const canManageInventory = sessionUser?.role === "administrator";
  const canRecordProcurement = sessionUser?.role === "administrator";
  const canRecordExpenses = sessionUser?.role === "administrator";
  const canViewReports = sessionUser?.role === "administrator";
  const canManageUsers = sessionUser?.role === "administrator";
  const isManagerPanelOpen = (panel: ManagerPanelKey): boolean => openManagerPanels[panel];
  const selectedReconciliationIssue = useMemo(
    () =>
      reconciliationSelectedIssueId === null
        ? null
        : (reconciliationIssues.find((issue) => issue.issueId === reconciliationSelectedIssueId) ??
          null),
    [reconciliationIssues, reconciliationSelectedIssueId],
  );

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
        return floorPointsToTenths(weight * material.pointsPerKg);
      }),
    [intakeLines, materials],
  );

  const intakeTotalPreviewPoints = useMemo(
    () =>
      intakeLinePreviews.reduce<number>((sum, previewPoints) => {
        if (previewPoints === null) {
          return sum;
        }
        return sumPointValues([sum, previewPoints]);
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
        return sumPointValues([sum, multiplyPointValue(item.pointsPrice, quantity)]);
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

  const loadPendingAdjustmentRequests = async (): Promise<void> => {
    setPendingRequestsLoading(true);
    setPendingRequestsError(null);
    try {
      const response = await adjustmentsClient.listRequests({
        status: "pending",
        limit: 100,
      });
      setPendingAdjustmentRequests(response.requests);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPendingRequestsError(message);
    } finally {
      setPendingRequestsLoading(false);
    }
  };

  const loadStaffUsers = async (): Promise<void> => {
    setStaffUsersLoading(true);
    setStaffUsersError(null);
    try {
      const users = await usersClient.listUsers();
      setStaffUsers(users);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStaffUsersError(message);
    } finally {
      setStaffUsersLoading(false);
    }
  };

  const loadMaterialsCollectedReport = async (filters?: {
    fromDate?: string | null;
    toDate?: string | null;
    locationText?: string | null;
    materialTypeId?: string | null;
  }): Promise<void> => {
    materialsReportRequestRef.current += 1;
    const requestId = materialsReportRequestRef.current;
    setMaterialsReportLoading(true);
    setMaterialsReportError(null);
    try {
      const report = await reportsClient.getMaterialsCollectedReport(filters);
      if (materialsReportRequestRef.current !== requestId) {
        return;
      }
      setMaterialsReportRows(report.rows);
      setMaterialsReportAppliedFilters(report.appliedFilters);
    } catch (error) {
      if (materialsReportRequestRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setMaterialsReportError(message);
    } finally {
      if (materialsReportRequestRef.current === requestId) {
        setMaterialsReportLoading(false);
      }
    }
  };

  const loadPointsLiabilityReport = async (filters?: { search?: string | null }): Promise<void> => {
    pointsLiabilityRequestRef.current += 1;
    const requestId = pointsLiabilityRequestRef.current;
    setPointsLiabilityLoading(true);
    setPointsLiabilityError(null);
    try {
      const report = await reportsClient.getPointsLiabilityReport(filters);
      if (pointsLiabilityRequestRef.current !== requestId) {
        return;
      }
      setPointsLiabilityRows(report.rows);
      setPointsLiabilitySummary(report.summary);
      setPointsLiabilityAppliedFilters(report.appliedFilters);
    } catch (error) {
      if (pointsLiabilityRequestRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setPointsLiabilityError(message);
    } finally {
      if (pointsLiabilityRequestRef.current === requestId) {
        setPointsLiabilityLoading(false);
      }
    }
  };

  const loadInventoryStatusReport = async (): Promise<void> => {
    inventoryStatusReportRequestRef.current += 1;
    const requestId = inventoryStatusReportRequestRef.current;
    setInventoryStatusReportLoading(true);
    setInventoryStatusReportError(null);
    try {
      const report = await reportsClient.getInventoryStatusReport();
      if (inventoryStatusReportRequestRef.current !== requestId) {
        return;
      }
      setInventoryStatusReportSummary(report.summary);
      setInventoryStatusReportRows(report.rows);
    } catch (error) {
      if (inventoryStatusReportRequestRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setInventoryStatusReportError(message);
    } finally {
      if (inventoryStatusReportRequestRef.current === requestId) {
        setInventoryStatusReportLoading(false);
      }
    }
  };

  const loadInventoryStatusLogReport = async (filters?: {
    fromDate?: string | null;
    toDate?: string | null;
    fromStatus?: InventoryStatus | null;
    toStatus?: InventoryStatus | null;
  }): Promise<void> => {
    inventoryStatusLogRequestRef.current += 1;
    const requestId = inventoryStatusLogRequestRef.current;
    setInventoryStatusLogLoading(true);
    setInventoryStatusLogError(null);
    try {
      const report = await reportsClient.getInventoryStatusLogReport(filters);
      if (inventoryStatusLogRequestRef.current !== requestId) {
        return;
      }
      setInventoryStatusLogRows(report.rows);
      setInventoryStatusLogAppliedFilters(report.appliedFilters);
      setInventoryStatusLogFromDate(report.appliedFilters.fromDate ?? "");
      setInventoryStatusLogToDate(report.appliedFilters.toDate ?? "");
    } catch (error) {
      if (inventoryStatusLogRequestRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setInventoryStatusLogError(message);
    } finally {
      if (inventoryStatusLogRequestRef.current === requestId) {
        setInventoryStatusLogLoading(false);
      }
    }
  };

  const loadSalesReport = async (filters?: {
    fromDate?: string | null;
    toDate?: string | null;
    locationText?: string | null;
    itemId?: string | null;
  }): Promise<void> => {
    salesReportRequestRef.current += 1;
    const requestId = salesReportRequestRef.current;
    setSalesReportLoading(true);
    setSalesReportError(null);
    try {
      const report = await reportsClient.getSalesReport(filters);
      if (salesReportRequestRef.current !== requestId) {
        return;
      }
      setSalesReportRows(report.rows);
      setSalesReportSummary(report.summary);
      setSalesReportAppliedFilters(report.appliedFilters);
      setSalesReportFromDate(report.appliedFilters.fromDate ?? "");
      setSalesReportToDate(report.appliedFilters.toDate ?? "");
    } catch (error) {
      if (salesReportRequestRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setSalesReportError(message);
    } finally {
      if (salesReportRequestRef.current === requestId) {
        setSalesReportLoading(false);
      }
    }
  };

  const loadCashflowReport = async (filters?: {
    fromDate?: string | null;
    toDate?: string | null;
    locationText?: string | null;
  }): Promise<void> => {
    cashflowReportRequestRef.current += 1;
    const requestId = cashflowReportRequestRef.current;
    setCashflowReportLoading(true);
    setCashflowReportError(null);
    try {
      const report = await reportsClient.getCashflowReport(filters);
      if (cashflowReportRequestRef.current !== requestId) {
        return;
      }
      setCashflowReportRows(report.rows);
      setCashflowReportSummary(report.summary);
      setCashflowReportExpenseCategories(report.expenseCategories);
      setCashflowReportAppliedFilters(report.appliedFilters);
      setCashflowReportFromDate(report.appliedFilters.fromDate ?? "");
      setCashflowReportToDate(report.appliedFilters.toDate ?? "");
    } catch (error) {
      if (cashflowReportRequestRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setCashflowReportError(message);
    } finally {
      if (cashflowReportRequestRef.current === requestId) {
        setCashflowReportLoading(false);
      }
    }
  };

  const loadReconciliationReport = async (append = false): Promise<void> => {
    reconciliationRequestRef.current += 1;
    const requestId = reconciliationRequestRef.current;
    if (append) {
      setReconciliationLoadingMore(true);
    } else {
      setReconciliationLoading(true);
    }
    setReconciliationError(null);
    try {
      const report = await reconciliationClient.getReport({
        limit: 50,
        cursor: append ? reconciliationNextCursor : null,
      });
      if (reconciliationRequestRef.current !== requestId) {
        return;
      }
      setReconciliationSummary(report.summary);
      setReconciliationNextCursor(report.nextCursor);
      setReconciliationIssues((previous) =>
        append ? [...previous, ...report.issues] : report.issues,
      );
    } catch (error) {
      if (reconciliationRequestRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setReconciliationError(message);
    } finally {
      if (reconciliationRequestRef.current === requestId) {
        if (append) {
          setReconciliationLoadingMore(false);
        } else {
          setReconciliationLoading(false);
        }
      }
    }
  };

  const toggleManagerPanel = async (
    panel: ManagerPanelKey,
    loadPanel?: () => Promise<void>,
  ): Promise<void> => {
    const nextOpen = !openManagerPanels[panel];
    setOpenManagerPanels((previous) => ({
      ...previous,
      [panel]: nextOpen,
    }));
    if (!nextOpen || loadedManagerPanels[panel] || loadPanel === undefined) {
      return;
    }
    setLoadedManagerPanels((previous) => ({
      ...previous,
      [panel]: true,
    }));
    await loadPanel();
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
    if (sessionStatus !== "authenticated") {
      return;
    }
    if (sessionUser?.role === "administrator") {
      setActiveView("person-search");
      void loadPendingAdjustmentRequests();
      void loadStaffUsers();
      return;
    }
    setActiveView("person-search");
    setPendingAdjustmentRequests([]);
    setStaffUsers([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, sessionUser?.role]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !canViewReports) {
      return;
    }
    setOpenManagerPanels(createClosedManagerPanels());
    setLoadedManagerPanels(createClosedManagerPanels());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, canViewReports]);

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
    if (pointsAdjustmentPersonId === null) {
      setPointsAdjustmentPersonId(firstPerson.id);
    }
  }, [intakePersonId, ledgerPersonId, people, pointsAdjustmentPersonId, salePersonId]);

  useEffect(() => {
    const selected = staffUsers.find((user) => user.id === editUserId) ?? null;
    if (selected === null) {
      return;
    }
    setEditUserUsername(selected.username);
    setEditUserRole(selected.role);
  }, [editUserId, staffUsers]);

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

  const handleRunMaterialsReport = async (): Promise<void> => {
    if (!canViewReports) {
      setMaterialsReportError("You do not have permission to view reports");
      return;
    }
    const fromDate = materialsReportFromDate.trim();
    const toDate = materialsReportToDate.trim();
    const locationText = materialsReportLocationText.trim();
    await loadMaterialsCollectedReport({
      fromDate: fromDate.length > 0 ? fromDate : null,
      toDate: toDate.length > 0 ? toDate : null,
      locationText: locationText.length > 0 ? locationText : null,
      materialTypeId: materialsReportMaterialTypeId,
    });
  };

  const handleRunPointsLiabilityReport = async (): Promise<void> => {
    if (!canViewReports) {
      setPointsLiabilityError("You do not have permission to view reports");
      return;
    }
    const search = pointsLiabilitySearch.trim();
    await loadPointsLiabilityReport({
      search: search.length > 0 ? search : null,
    });
  };

  const handleRunInventoryStatusReport = async (): Promise<void> => {
    if (!canViewReports) {
      setInventoryStatusReportError("You do not have permission to view reports");
      return;
    }
    await loadInventoryStatusReport();
  };

  const handleRunInventoryStatusLogReport = async (): Promise<void> => {
    if (!canViewReports) {
      setInventoryStatusLogError("You do not have permission to view reports");
      return;
    }
    const fromDate = inventoryStatusLogFromDate.trim();
    const toDate = inventoryStatusLogToDate.trim();
    await loadInventoryStatusLogReport({
      fromDate: fromDate.length > 0 ? fromDate : null,
      toDate: toDate.length > 0 ? toDate : null,
      fromStatus: inventoryStatusLogFromStatus,
      toStatus: inventoryStatusLogToStatus,
    });
  };

  const handleRunSalesReport = async (): Promise<void> => {
    if (!canViewReports) {
      setSalesReportError("You do not have permission to view reports");
      return;
    }
    const fromDate = salesReportFromDate.trim();
    const toDate = salesReportToDate.trim();
    const locationText = salesReportLocationText.trim();
    await loadSalesReport({
      fromDate: fromDate.length > 0 ? fromDate : null,
      toDate: toDate.length > 0 ? toDate : null,
      locationText: locationText.length > 0 ? locationText : null,
      itemId: salesReportItemId,
    });
  };

  const handleRunCashflowReport = async (): Promise<void> => {
    if (!canViewReports) {
      setCashflowReportError("You do not have permission to view reports");
      return;
    }
    const fromDate = cashflowReportFromDate.trim();
    const toDate = cashflowReportToDate.trim();
    const locationText = cashflowReportLocationText.trim();
    await loadCashflowReport({
      fromDate: fromDate.length > 0 ? fromDate : null,
      toDate: toDate.length > 0 ? toDate : null,
      locationText: locationText.length > 0 ? locationText : null,
    });
  };

  const handleLoadMoreReconciliationIssues = async (): Promise<void> => {
    if (!canViewReports || reconciliationNextCursor === null) {
      return;
    }
    await loadReconciliationReport(true);
  };

  const handleRepairReconciliationIssue = async (): Promise<void> => {
    if (!canViewReports) {
      setReconciliationRepairError("You do not have permission to repair reconciliation issues");
      return;
    }
    if (reconciliationSelectedIssueId === null) {
      setReconciliationRepairError("Select a repairable issue first");
      return;
    }
    const notes = reconciliationRepairNotes.trim();
    if (notes.length === 0) {
      setReconciliationRepairError("Repair notes are required");
      return;
    }
    setReconciliationRepairPending(true);
    setReconciliationRepairError(null);
    try {
      await reconciliationClient.repairIssue(reconciliationSelectedIssueId, notes);
      await loadReconciliationReport();
      await sync.syncNow();
      setReconciliationSelectedIssueId(null);
      setReconciliationRepairNotes("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReconciliationRepairError(message);
    } finally {
      setReconciliationRepairPending(false);
    }
  };

  const handleInventoryAdjustmentRequest = async (): Promise<void> => {
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
      await adjustmentsClient.requestInventoryAdjustment({
        inventoryBatchId: adjustmentBatchId,
        requestedStatus: adjustmentStatus,
        quantity,
        reason: adjustmentReason.trim(),
        notes: toNullableOrUndefined(adjustmentNotes) ?? null,
      });
      await loadPendingAdjustmentRequests();
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

  const handlePointsAdjustmentRequest = async (): Promise<void> => {
    if (pointsAdjustmentPersonId === null) {
      setPointsAdjustmentError("Person is required");
      return;
    }
    const deltaPoints = Number.parseFloat(pointsAdjustmentDelta);
    if (!Number.isFinite(deltaPoints) || deltaPoints === 0) {
      setPointsAdjustmentError("Adjustment points must be a non-zero number");
      return;
    }
    if (pointsAdjustmentReason.trim().length === 0) {
      setPointsAdjustmentError("Reason is required");
      return;
    }
    setPointsAdjustmentPending(true);
    setPointsAdjustmentError(null);
    try {
      await adjustmentsClient.requestPointsAdjustment({
        personId: pointsAdjustmentPersonId,
        deltaPoints,
        reason: pointsAdjustmentReason.trim(),
        notes: toNullableOrUndefined(pointsAdjustmentNotes) ?? null,
      });
      await loadPendingAdjustmentRequests();
      setPointsAdjustmentDelta("");
      setPointsAdjustmentReason("");
      setPointsAdjustmentNotes("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPointsAdjustmentError(message);
    } finally {
      setPointsAdjustmentPending(false);
    }
  };

  const handlePointsAdjustmentApply = async (): Promise<void> => {
    if (!canManageInventory) {
      setApplyPointsError("You do not have permission to adjust points");
      return;
    }
    if (applyPointsPersonId === null) {
      setApplyPointsError("Person is required");
      return;
    }
    const delta = Number.parseFloat(applyPointsDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      setApplyPointsError("Adjustment points must be a non-zero number");
      return;
    }
    if (applyPointsReason.trim().length === 0) {
      setApplyPointsError("Reason is required");
      return;
    }
    setApplyPointsPending(true);
    setApplyPointsError(null);
    try {
      await adjustmentsClient.applyPointsAdjustment({
        requestEventId: applyPointsRequestEventId,
        personId: applyPointsPersonId,
        deltaPoints: delta,
        reason: applyPointsReason.trim(),
        notes: toNullableOrUndefined(applyPointsNotes) ?? null,
      });
      await Promise.all([loadPendingAdjustmentRequests(), loadLedger(applyPointsPersonId)]);
      setApplyPointsDelta("");
      setApplyPointsReason("");
      setApplyPointsNotes("");
      setApplyPointsRequestEventId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApplyPointsError(message);
    } finally {
      setApplyPointsPending(false);
    }
  };

  const handleInventoryAdjustmentApply = async (): Promise<void> => {
    if (!canManageInventory) {
      setApplyInventoryError("You do not have permission to adjust inventory");
      return;
    }
    if (applyInventoryBatchId === null) {
      setApplyInventoryError("Inventory batch is required");
      return;
    }
    if (applyInventoryFromStatus === applyInventoryToStatus) {
      setApplyInventoryError("From status and to status must differ");
      return;
    }
    const quantity = Number.parseInt(applyInventoryQuantity, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setApplyInventoryError("Quantity must be a positive integer");
      return;
    }
    if (applyInventoryReason.trim().length === 0) {
      setApplyInventoryError("Reason is required");
      return;
    }
    setApplyInventoryPending(true);
    setApplyInventoryError(null);
    try {
      await adjustmentsClient.applyInventoryAdjustment({
        requestEventId: applyInventoryRequestEventId,
        inventoryBatchId: applyInventoryBatchId,
        fromStatus: applyInventoryFromStatus,
        toStatus: applyInventoryToStatus,
        quantity,
        reason: applyInventoryReason.trim(),
        notes: toNullableOrUndefined(applyInventoryNotes) ?? null,
      });
      await Promise.all([loadPendingAdjustmentRequests(), loadInventory()]);
      setApplyInventoryQuantity("");
      setApplyInventoryReason("");
      setApplyInventoryNotes("");
      setApplyInventoryRequestEventId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApplyInventoryError(message);
    } finally {
      setApplyInventoryPending(false);
    }
  };

  const handleCreateUser = async (): Promise<void> => {
    if (!canManageUsers) {
      setCreateUserError("You do not have permission to manage users");
      return;
    }
    if (createUserUsername.trim().length === 0 || createUserPasscode.trim().length === 0) {
      setCreateUserError("Username and passcode are required");
      return;
    }
    setCreateUserPending(true);
    setCreateUserError(null);
    try {
      await usersClient.createUser({
        username: createUserUsername.trim(),
        role: createUserRole,
        passcode: createUserPasscode.trim(),
      });
      await loadStaffUsers();
      setCreateUserUsername("");
      setCreateUserPasscode("");
      setCreateUserRole("user");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCreateUserError(message);
    } finally {
      setCreateUserPending(false);
    }
  };

  const handleUpdateUser = async (): Promise<void> => {
    if (!canManageUsers) {
      setEditUserError("You do not have permission to manage users");
      return;
    }
    if (editUserId === null) {
      setEditUserError("Select a user");
      return;
    }
    if (editUserUsername.trim().length === 0) {
      setEditUserError("Username is required");
      return;
    }
    setEditUserPending(true);
    setEditUserError(null);
    try {
      await usersClient.updateUser(editUserId, {
        username: editUserUsername.trim(),
        role: editUserRole,
        ...(editUserPasscode.trim().length > 0 ? { passcode: editUserPasscode.trim() } : {}),
      });
      await loadStaffUsers();
      setEditUserPasscode("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEditUserError(message);
    } finally {
      setEditUserPending(false);
    }
  };

  const pendingAdjustmentCount = pendingAdjustmentRequests.filter(
    (request) => request.status === "pending",
  ).length;
  const ledgerBalanceText =
    ledgerBalance === null ? "-" : formatPointValue(ledgerBalance.balancePoints);

  if (sessionStatus !== "authenticated") {
    return (
      <AppShell padding="md">
        <AppShell.Main className="mainSurface">
          <Container size="sm" py="xl">
            <Stack gap="md">
              {startupWarningBanner}
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="md">
                  <Title order={3}>Login</Title>
                  <TextInput
                    label="Username"
                    value={username}
                    style={{ width: "100%", maxWidth: "300px" }}
                    onChange={(event) => {
                      setUsername(event.currentTarget.value);
                    }}
                  />
                  <PasswordInput
                    label="Passcode"
                    value={passcode}
                    style={{ width: "100%", maxWidth: "300px" }}
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
            </Stack>
          </Container>
        </AppShell.Main>
      </AppShell>
    );
  }

  const showProcurementPanel = canManageInventory && activeView === "shop-log";
  const showExpensePanel = canManageInventory && activeView === "shop-log";
  const showLedgerPanel = canManageInventory && activeView === "collection-log";

  return (
    <AppShell
      header={{
        height: 68,
      }}
      navbar={{
        width: 280,
        breakpoint: "sm",
      }}
      padding="md"
    >
      <AppShell.Navbar p="md">
        <Stack gap="xs">
          <Text fw={700} size="sm">
            Navigation
          </Text>
          <Text size="xs" c="dimmed">
            Person
          </Text>
          <Button
            variant={activeView === "person-search" ? "filled" : "light"}
            onClick={() => {
              setActiveView("person-search");
            }}
          >
            Search
          </Button>
          <Button
            variant={activeView === "person-create" ? "filled" : "light"}
            onClick={() => {
              setActiveView("person-create");
            }}
          >
            Create
          </Button>
          <Button
            variant={activeView === "person-edit" ? "filled" : "light"}
            onClick={() => {
              setActiveView("person-edit");
            }}
          >
            Edit
          </Button>
          <Text size="xs" c="dimmed" mt="sm">
            Collection
          </Text>
          <Button
            variant={activeView === "collection-log" ? "filled" : "light"}
            onClick={() => {
              setActiveView("collection-log");
            }}
          >
            Log material collection
          </Button>
          <Text size="xs" c="dimmed" mt="sm">
            Shop
          </Text>
          <Button
            variant={activeView === "shop-log" ? "filled" : "light"}
            onClick={() => {
              setActiveView("shop-log");
            }}
          >
            Log sale
          </Button>
          <Group justify="space-between" mt="sm">
            <Text size="xs" c="dimmed">
              Adjustments
            </Text>
            {canManageInventory ? (
              <Badge color="red">{String(pendingAdjustmentCount)}</Badge>
            ) : null}
          </Group>
          {canManageInventory ? (
            <>
              <Button
                variant={activeView === "adjustments-points-apply" ? "filled" : "light"}
                onClick={() => {
                  setActiveView("adjustments-points-apply");
                }}
              >
                Adjust points
              </Button>
              <Button
                variant={activeView === "adjustments-inventory-apply" ? "filled" : "light"}
                onClick={() => {
                  setActiveView("adjustments-inventory-apply");
                }}
              >
                Adjust inventory
              </Button>
            </>
          ) : (
            <>
              <Button
                variant={activeView === "adjustments-points-request" ? "filled" : "light"}
                onClick={() => {
                  setActiveView("adjustments-points-request");
                }}
              >
                Request points adjustment
              </Button>
              <Button
                variant={activeView === "adjustments-inventory-request" ? "filled" : "light"}
                onClick={() => {
                  setActiveView("adjustments-inventory-request");
                }}
              >
                Request inventory adjustment
              </Button>
            </>
          )}
          {canViewReports ? (
            <>
              <Text size="xs" c="dimmed" mt="sm">
                Reporting
              </Text>
              <Button
                variant={activeView === "reporting" ? "filled" : "light"}
                onClick={() => {
                  setActiveView("reporting");
                }}
              >
                Reports
              </Button>
            </>
          ) : null}
          {canManageUsers ? (
            <>
              <Text size="xs" c="dimmed" mt="sm">
                User management
              </Text>
              <Button
                variant={activeView === "users-list" ? "filled" : "light"}
                onClick={() => {
                  setActiveView("users-list");
                }}
              >
                List all
              </Button>
              <Button
                variant={activeView === "users-create" ? "filled" : "light"}
                onClick={() => {
                  setActiveView("users-create");
                }}
              >
                Add new user
              </Button>
              <Button
                variant={activeView === "users-edit" ? "filled" : "light"}
                onClick={() => {
                  setActiveView("users-edit");
                }}
              >
                Rename and edit user
              </Button>
            </>
          ) : null}
        </Stack>
      </AppShell.Navbar>
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
            {startupWarningBanner}
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
              {activeView === "person-search" ? (
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
              ) : null}

              {activeView === "person-create" ? (
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
              ) : null}
            </SimpleGrid>

            {canRecordSales && activeView === "person-edit" ? (
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

            {showProcurementPanel ? (
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
                            label: `${item.name} (${formatPointValue(item.pointsPrice)} pts)`,
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

            {showExpensePanel ? (
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

            {canViewReports && activeView === "reporting" ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>Integrity and Reconciliation</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void toggleManagerPanel("reconciliation", async () => {
                          await loadReconciliationReport();
                        });
                      }}
                    >
                      {isManagerPanelOpen("reconciliation")
                        ? "Hide Integrity and Reconciliation"
                        : "Open Integrity and Reconciliation"}
                    </Button>
                  </Group>
                  {isManagerPanelOpen("reconciliation") && reconciliationSummary !== null ? (
                    <SimpleGrid cols={{ base: 2, md: 4 }}>
                      <Card withBorder radius="md" padding="sm">
                        <Text size="sm">Total issues</Text>
                        <Text size="lg" fw={700}>
                          {String(reconciliationSummary.totalIssues)}
                        </Text>
                      </Card>
                      <Card withBorder radius="md" padding="sm">
                        <Text size="sm">Errors</Text>
                        <Text size="lg" fw={700}>
                          {String(reconciliationSummary.errorCount)}
                        </Text>
                      </Card>
                      <Card withBorder radius="md" padding="sm">
                        <Text size="sm">Warnings</Text>
                        <Text size="lg" fw={700}>
                          {String(reconciliationSummary.warningCount)}
                        </Text>
                      </Card>
                      <Card withBorder radius="md" padding="sm">
                        <Text size="sm">Repairable</Text>
                        <Text size="lg" fw={700}>
                          {String(reconciliationSummary.repairableCount)}
                        </Text>
                      </Card>
                    </SimpleGrid>
                  ) : null}
                  {isManagerPanelOpen("reconciliation") ? (
                    <Group>
                      <Button
                        onClick={() => {
                          void loadReconciliationReport();
                        }}
                        loading={reconciliationLoading}
                      >
                        Refresh Integrity Report
                      </Button>
                      <Button
                        variant="default"
                        onClick={() => {
                          void handleLoadMoreReconciliationIssues();
                        }}
                        loading={reconciliationLoadingMore}
                        disabled={reconciliationNextCursor === null}
                      >
                        Load More
                      </Button>
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("reconciliation") && reconciliationError !== null ? (
                    <Text c="red">{reconciliationError}</Text>
                  ) : null}
                  {isManagerPanelOpen("reconciliation") ? (
                    <Stack gap="xs">
                      {reconciliationIssues.map((issue) => (
                        <Card key={issue.issueId} withBorder radius="md" padding="sm">
                          <Stack gap="xs">
                            <Group justify="space-between">
                              <Text fw={600}>{issue.code}</Text>
                              <Badge color={issue.severity === "error" ? "red" : "yellow"}>
                                {issue.severity}
                              </Badge>
                            </Group>
                            <Text size="sm">{issue.detail}</Text>
                            <Text
                              size="xs"
                              c="dimmed"
                            >{`${issue.entityType}: ${issue.entityId}`}</Text>
                            {issue.expected !== null && issue.expected !== undefined ? (
                              <Text
                                size="xs"
                                c="dimmed"
                              >{`Expected: ${JSON.stringify(issue.expected)}`}</Text>
                            ) : null}
                            {issue.actual !== null && issue.actual !== undefined ? (
                              <Text
                                size="xs"
                                c="dimmed"
                              >{`Actual: ${JSON.stringify(issue.actual)}`}</Text>
                            ) : null}
                            {issue.suggestedRepair !== null &&
                            issue.suggestedRepair !== undefined ? (
                              <Button
                                variant={
                                  reconciliationSelectedIssueId === issue.issueId
                                    ? "filled"
                                    : "light"
                                }
                                size="xs"
                                onClick={() => {
                                  setReconciliationSelectedIssueId(issue.issueId);
                                  setReconciliationRepairError(null);
                                }}
                              >
                                {issue.suggestedRepair.repairKind === "projection_rebuild"
                                  ? "Rebuild Projections"
                                  : "Apply Suggested Fix"}
                              </Button>
                            ) : null}
                          </Stack>
                        </Card>
                      ))}
                      {reconciliationIssues.length === 0 && !reconciliationLoading ? (
                        <Text size="sm" c="dimmed">
                          No reconciliation issues found.
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
                  {isManagerPanelOpen("reconciliation") &&
                  selectedReconciliationIssue !== null &&
                  selectedReconciliationIssue.suggestedRepair !== null ? (
                    <Card withBorder radius="md" padding="sm">
                      {(() => {
                        const selectedRepair = selectedReconciliationIssue.suggestedRepair;
                        if (selectedRepair === undefined || selectedRepair === null) {
                          return null;
                        }
                        return (
                          <Stack gap="xs">
                            <Text fw={600}>Repair Confirmation</Text>
                            <Text size="sm">{selectedRepair.reasonTemplate}</Text>
                            <Textarea
                              label="Manager Notes"
                              value={reconciliationRepairNotes}
                              onChange={(event) => {
                                setReconciliationRepairNotes(event.currentTarget.value);
                              }}
                            />
                            {reconciliationRepairError !== null ? (
                              <Text c="red">{reconciliationRepairError}</Text>
                            ) : null}
                            <Button
                              onClick={() => {
                                void handleRepairReconciliationIssue();
                              }}
                              loading={reconciliationRepairPending}
                            >
                              {selectedRepair.repairKind === "projection_rebuild"
                                ? "Confirm Rebuild"
                                : "Confirm Repair"}
                            </Button>
                          </Stack>
                        );
                      })()}
                    </Card>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            {canViewReports && activeView === "reporting" ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>Materials Collected Report</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void toggleManagerPanel("materialsReport", async () => {
                          await loadMaterialsCollectedReport();
                        });
                      }}
                    >
                      {isManagerPanelOpen("materialsReport")
                        ? "Hide Materials Collected Report"
                        : "Open Materials Collected Report"}
                    </Button>
                  </Group>
                  {isManagerPanelOpen("materialsReport") ? (
                    <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }}>
                      <TextInput
                        label="From Date"
                        placeholder="YYYY-MM-DD"
                        value={materialsReportFromDate}
                        onChange={(event) => {
                          setMaterialsReportFromDate(event.currentTarget.value);
                        }}
                      />
                      <TextInput
                        label="To Date"
                        placeholder="YYYY-MM-DD"
                        value={materialsReportToDate}
                        onChange={(event) => {
                          setMaterialsReportToDate(event.currentTarget.value);
                        }}
                      />
                      <Select
                        label="Material Type"
                        data={materials.map((material) => ({
                          value: material.id,
                          label: material.name,
                        }))}
                        value={materialsReportMaterialTypeId}
                        onChange={setMaterialsReportMaterialTypeId}
                        searchable
                        clearable
                      />
                      <TextInput
                        label="Location"
                        value={materialsReportLocationText}
                        onChange={(event) => {
                          setMaterialsReportLocationText(event.currentTarget.value);
                        }}
                      />
                    </SimpleGrid>
                  ) : null}
                  {isManagerPanelOpen("materialsReport") ? (
                    <Group>
                      <Button
                        onClick={() => {
                          void handleRunMaterialsReport();
                        }}
                        loading={materialsReportLoading}
                      >
                        Run Report
                      </Button>
                      <Button
                        variant="light"
                        disabled={materialsReportRows.length === 0}
                        onClick={() => {
                          downloadCsv(
                            "materials-collected-report.csv",
                            buildMaterialsReportExportRows(materialsReportRows),
                          );
                        }}
                      >
                        Export CSV
                      </Button>
                      {materialsReportAppliedFilters !== null ? (
                        <Text size="sm" c="dimmed">
                          {`Applied: ${materialsReportAppliedFilters.fromDate ?? "-"} to ${materialsReportAppliedFilters.toDate ?? "-"}`}
                        </Text>
                      ) : null}
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("materialsReport") && materialsReportError !== null ? (
                    <Text c="red">{materialsReportError}</Text>
                  ) : null}
                  {isManagerPanelOpen("materialsReport") ? (
                    <Stack gap="xs">
                      {materialsReportRows.map((row) => (
                        <Card
                          key={`${row.day}-${row.materialTypeId}-${row.locationText}`}
                          withBorder
                          radius="md"
                          padding="sm"
                        >
                          <Text size="sm">{`${row.day} | ${row.materialName} | ${row.locationText}`}</Text>
                          <Text
                            size="xs"
                            c="dimmed"
                          >{`Weight: ${String(row.totalWeightKg)} kg | Points: ${formatPointValue(row.totalPoints)}`}</Text>
                        </Card>
                      ))}
                      {materialsReportRows.length === 0 && !materialsReportLoading ? (
                        <Text size="sm" c="dimmed">
                          No materials report rows found.
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            {canViewReports && activeView === "reporting" ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>Points Liability Report</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void toggleManagerPanel("pointsLiability", async () => {
                          await loadPointsLiabilityReport();
                        });
                      }}
                    >
                      {isManagerPanelOpen("pointsLiability")
                        ? "Hide Points Liability Report"
                        : "Open Points Liability Report"}
                    </Button>
                  </Group>
                  {isManagerPanelOpen("pointsLiability") ? (
                    <Group align="end">
                      <TextInput
                        label="Person Search"
                        value={pointsLiabilitySearch}
                        onChange={(event) => {
                          setPointsLiabilitySearch(event.currentTarget.value);
                        }}
                      />
                      <Button
                        onClick={() => {
                          void handleRunPointsLiabilityReport();
                        }}
                        loading={pointsLiabilityLoading}
                      >
                        Run Report
                      </Button>
                      <Button
                        variant="light"
                        disabled={pointsLiabilityRows.length === 0}
                        onClick={() => {
                          downloadCsv(
                            "points-liability-report.csv",
                            buildPointsLiabilityExportRows(pointsLiabilityRows),
                          );
                        }}
                      >
                        Export CSV
                      </Button>
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("pointsLiability") &&
                  pointsLiabilityAppliedFilters?.search != null ? (
                    <Text
                      size="sm"
                      c="dimmed"
                    >{`Applied search: ${pointsLiabilityAppliedFilters.search}`}</Text>
                  ) : null}
                  {isManagerPanelOpen("pointsLiability") && pointsLiabilitySummary !== null ? (
                    <Group>
                      <Text size="sm">{`Total outstanding: ${formatPointValue(pointsLiabilitySummary.totalOutstandingPoints)}`}</Text>
                      <Text size="sm">{`People with balances: ${String(pointsLiabilitySummary.personCount)}`}</Text>
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("pointsLiability") && pointsLiabilityError !== null ? (
                    <Text c="red">{pointsLiabilityError}</Text>
                  ) : null}
                  {isManagerPanelOpen("pointsLiability") ? (
                    <Stack gap="xs">
                      {pointsLiabilityRows.map((row) => (
                        <Card key={row.personId} withBorder radius="md" padding="sm">
                          <Text size="sm">{`${row.name} ${row.surname}`}</Text>
                          <Text
                            size="xs"
                            c="dimmed"
                          >{`Balance: ${formatPointValue(row.balancePoints)}`}</Text>
                        </Card>
                      ))}
                      {pointsLiabilityRows.length === 0 && !pointsLiabilityLoading ? (
                        <Text size="sm" c="dimmed">
                          No points liability rows found.
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            {canViewReports && activeView === "reporting" ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>Inventory Status Report</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void toggleManagerPanel("inventoryStatusReport", async () => {
                          await loadInventoryStatusReport();
                        });
                      }}
                    >
                      {isManagerPanelOpen("inventoryStatusReport")
                        ? "Hide Inventory Status Report"
                        : "Open Inventory Status Report"}
                    </Button>
                  </Group>
                  {isManagerPanelOpen("inventoryStatusReport") ? (
                    <Group>
                      <Button
                        onClick={() => {
                          void handleRunInventoryStatusReport();
                        }}
                        loading={inventoryStatusReportLoading}
                      >
                        Run Report
                      </Button>
                      <Button
                        variant="light"
                        disabled={
                          inventoryStatusReportSummary.length === 0 &&
                          inventoryStatusReportRows.length === 0
                        }
                        onClick={() => {
                          downloadCsv(
                            "inventory-status-report.csv",
                            buildInventoryStatusExportRows(
                              inventoryStatusReportSummary,
                              inventoryStatusReportRows,
                            ),
                          );
                        }}
                      >
                        Export CSV
                      </Button>
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("inventoryStatusReport") &&
                  inventoryStatusReportError !== null ? (
                    <Text c="red">{inventoryStatusReportError}</Text>
                  ) : null}
                  {isManagerPanelOpen("inventoryStatusReport") ? (
                    <Stack gap="xs">
                      {inventoryStatusReportSummary.map((row) => (
                        <Card key={row.status} withBorder radius="md" padding="sm">
                          <Text size="sm">{`${row.status}: Qty ${String(row.totalQuantity)} | Cost ${formatCurrencyValue(row.totalCostValue)}`}</Text>
                        </Card>
                      ))}
                    </Stack>
                  ) : null}
                  {isManagerPanelOpen("inventoryStatusReport") ? <Divider /> : null}
                  {isManagerPanelOpen("inventoryStatusReport") ? (
                    <Stack gap="xs">
                      {inventoryStatusReportRows.map((row) => (
                        <Card
                          key={`${row.status}-${row.itemId}-${row.unitCost}`}
                          withBorder
                          radius="md"
                          padding="sm"
                        >
                          <Text size="sm">{`${row.status} | ${row.itemName}`}</Text>
                          <Text
                            size="xs"
                            c="dimmed"
                          >{`Qty: ${String(row.quantity)} | Unit cost: ${formatCurrencyValue(row.unitCost)} | Cost: ${formatCurrencyValue(row.totalCostValue)}`}</Text>
                        </Card>
                      ))}
                      {inventoryStatusReportRows.length === 0 && !inventoryStatusReportLoading ? (
                        <Text size="sm" c="dimmed">
                          No inventory report rows found.
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            {canViewReports && activeView === "reporting" ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>Inventory Status Change Log</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void toggleManagerPanel("inventoryStatusLog", async () => {
                          await loadInventoryStatusLogReport();
                        });
                      }}
                    >
                      {isManagerPanelOpen("inventoryStatusLog")
                        ? "Hide Inventory Status Change Log"
                        : "Open Inventory Status Change Log"}
                    </Button>
                  </Group>
                  {isManagerPanelOpen("inventoryStatusLog") ? (
                    <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }}>
                      <TextInput
                        label="Log From Date"
                        placeholder="YYYY-MM-DD"
                        value={inventoryStatusLogFromDate}
                        onChange={(event) => {
                          setInventoryStatusLogFromDate(event.currentTarget.value);
                        }}
                      />
                      <TextInput
                        label="Log To Date"
                        placeholder="YYYY-MM-DD"
                        value={inventoryStatusLogToDate}
                        onChange={(event) => {
                          setInventoryStatusLogToDate(event.currentTarget.value);
                        }}
                      />
                      <Select
                        label="From Status Filter"
                        data={inventoryStatuses.map((status) => ({
                          value: status,
                          label: status,
                        }))}
                        value={inventoryStatusLogFromStatus}
                        onChange={(value) => {
                          setInventoryStatusLogFromStatus(value as InventoryStatus | null);
                        }}
                        clearable
                      />
                      <Select
                        label="To Status Filter"
                        data={inventoryStatuses.map((status) => ({
                          value: status,
                          label: status,
                        }))}
                        value={inventoryStatusLogToStatus}
                        onChange={(value) => {
                          setInventoryStatusLogToStatus(value as InventoryStatus | null);
                        }}
                        clearable
                      />
                    </SimpleGrid>
                  ) : null}
                  {isManagerPanelOpen("inventoryStatusLog") ? (
                    <Group>
                      <Button
                        onClick={() => {
                          void handleRunInventoryStatusLogReport();
                        }}
                        loading={inventoryStatusLogLoading}
                      >
                        Run Report
                      </Button>
                      <Button
                        variant="light"
                        disabled={inventoryStatusLogRows.length === 0}
                        onClick={() => {
                          downloadCsv(
                            "inventory-status-log-report.csv",
                            buildInventoryStatusLogExportRows(inventoryStatusLogRows),
                          );
                        }}
                      >
                        Export CSV
                      </Button>
                      {inventoryStatusLogAppliedFilters !== null ? (
                        <Text size="sm" c="dimmed">
                          {`Applied: ${inventoryStatusLogAppliedFilters.fromDate ?? "-"} to ${inventoryStatusLogAppliedFilters.toDate ?? "-"}`}
                        </Text>
                      ) : null}
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("inventoryStatusLog") && inventoryStatusLogError !== null ? (
                    <Text c="red">{inventoryStatusLogError}</Text>
                  ) : null}
                  {isManagerPanelOpen("inventoryStatusLog") ? (
                    <Stack gap="xs">
                      {inventoryStatusLogRows.map((row) => (
                        <Card key={row.eventId} withBorder radius="md" padding="sm">
                          <Text size="sm">
                            {`${row.occurredAt.slice(0, 16).replace("T", " ")} | ${row.inventoryBatchId} | ${row.itemName ?? "-"}`}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {`${row.fromStatus} -> ${row.toStatus} | Qty ${String(row.quantity)} | Reason: ${row.reason ?? "-"}`}
                          </Text>
                          {row.notes !== null ? (
                            <Text size="xs" c="dimmed">{`Notes: ${row.notes}`}</Text>
                          ) : null}
                        </Card>
                      ))}
                      {inventoryStatusLogRows.length === 0 && !inventoryStatusLogLoading ? (
                        <Text size="sm" c="dimmed">
                          No inventory status changes found.
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            {canViewReports && activeView === "reporting" ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>Sales Report</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void toggleManagerPanel("salesReport", async () => {
                          await loadSalesReport();
                        });
                      }}
                    >
                      {isManagerPanelOpen("salesReport")
                        ? "Hide Sales Report"
                        : "Open Sales Report"}
                    </Button>
                  </Group>
                  {isManagerPanelOpen("salesReport") ? (
                    <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }}>
                      <TextInput
                        label="Sales From Date"
                        placeholder="YYYY-MM-DD"
                        value={salesReportFromDate}
                        onChange={(event) => {
                          setSalesReportFromDate(event.currentTarget.value);
                        }}
                      />
                      <TextInput
                        label="Sales To Date"
                        placeholder="YYYY-MM-DD"
                        value={salesReportToDate}
                        onChange={(event) => {
                          setSalesReportToDate(event.currentTarget.value);
                        }}
                      />
                      <Select
                        label="Sales Item"
                        data={items.map((item) => ({
                          value: item.id,
                          label: item.name,
                        }))}
                        value={salesReportItemId}
                        onChange={setSalesReportItemId}
                        searchable
                        clearable
                      />
                      <TextInput
                        label="Sales Location"
                        value={salesReportLocationText}
                        onChange={(event) => {
                          setSalesReportLocationText(event.currentTarget.value);
                        }}
                      />
                    </SimpleGrid>
                  ) : null}
                  {isManagerPanelOpen("salesReport") ? (
                    <Group>
                      <Button
                        onClick={() => {
                          void handleRunSalesReport();
                        }}
                        loading={salesReportLoading}
                      >
                        Run Report
                      </Button>
                      <Button
                        variant="light"
                        disabled={salesReportRows.length === 0}
                        onClick={() => {
                          downloadCsv(
                            "sales-report.csv",
                            buildSalesReportExportRows(salesReportRows),
                          );
                        }}
                      >
                        Export CSV
                      </Button>
                      {salesReportAppliedFilters !== null ? (
                        <Text size="sm" c="dimmed">
                          {`Applied: ${salesReportAppliedFilters.fromDate ?? "-"} to ${salesReportAppliedFilters.toDate ?? "-"}`}
                        </Text>
                      ) : null}
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("salesReport") && salesReportSummary !== null ? (
                    <Group>
                      <Text size="sm">{`Total quantity: ${String(salesReportSummary.totalQuantity)}`}</Text>
                      <Text size="sm">{`Total points: ${formatPointValue(salesReportSummary.totalPoints)}`}</Text>
                      <Text size="sm">{`Sale events: ${String(salesReportSummary.saleCount)}`}</Text>
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("salesReport") && salesReportError !== null ? (
                    <Text c="red">{salesReportError}</Text>
                  ) : null}
                  {isManagerPanelOpen("salesReport") ? (
                    <Stack gap="xs">
                      {salesReportRows.map((row) => (
                        <Card
                          key={`${row.day}-${row.locationText}-${row.itemId}`}
                          withBorder
                          radius="md"
                          padding="sm"
                        >
                          <Text size="sm">{`${row.day} | ${row.locationText} | ${row.itemName}`}</Text>
                          <Text
                            size="xs"
                            c="dimmed"
                          >{`Qty: ${String(row.totalQuantity)} | Points: ${formatPointValue(row.totalPoints)} | Sales: ${String(row.saleCount)}`}</Text>
                        </Card>
                      ))}
                      {salesReportRows.length === 0 && !salesReportLoading ? (
                        <Text size="sm" c="dimmed">
                          No sales report rows found.
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            {canViewReports && activeView === "reporting" ? (
              <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>Cashflow Report</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void toggleManagerPanel("cashflowReport", async () => {
                          await loadCashflowReport();
                        });
                      }}
                    >
                      {isManagerPanelOpen("cashflowReport")
                        ? "Hide Cashflow Report"
                        : "Open Cashflow Report"}
                    </Button>
                  </Group>
                  {isManagerPanelOpen("cashflowReport") ? (
                    <SimpleGrid cols={{ base: 1, md: 3 }}>
                      <TextInput
                        label="Cashflow From Date"
                        placeholder="YYYY-MM-DD"
                        value={cashflowReportFromDate}
                        onChange={(event) => {
                          setCashflowReportFromDate(event.currentTarget.value);
                        }}
                      />
                      <TextInput
                        label="Cashflow To Date"
                        placeholder="YYYY-MM-DD"
                        value={cashflowReportToDate}
                        onChange={(event) => {
                          setCashflowReportToDate(event.currentTarget.value);
                        }}
                      />
                      <TextInput
                        label="Cashflow Location"
                        value={cashflowReportLocationText}
                        onChange={(event) => {
                          setCashflowReportLocationText(event.currentTarget.value);
                        }}
                      />
                    </SimpleGrid>
                  ) : null}
                  {isManagerPanelOpen("cashflowReport") ? (
                    <Group>
                      <Button
                        onClick={() => {
                          void handleRunCashflowReport();
                        }}
                        loading={cashflowReportLoading}
                      >
                        Run Report
                      </Button>
                      <Button
                        variant="light"
                        disabled={
                          cashflowReportRows.length === 0 &&
                          cashflowReportExpenseCategories.length === 0
                        }
                        onClick={() => {
                          downloadCsv(
                            "cashflow-report.csv",
                            buildCashflowExportRows(
                              cashflowReportRows,
                              cashflowReportExpenseCategories,
                            ),
                          );
                        }}
                      >
                        Export CSV
                      </Button>
                      {cashflowReportAppliedFilters !== null ? (
                        <Text size="sm" c="dimmed">
                          {`Applied: ${cashflowReportAppliedFilters.fromDate ?? "-"} to ${cashflowReportAppliedFilters.toDate ?? "-"}`}
                        </Text>
                      ) : null}
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("cashflowReport") && cashflowReportSummary !== null ? (
                    <Group>
                      <Text size="sm">{`Sales value: ${formatPointValue(cashflowReportSummary.totalSalesPointsValue)}`}</Text>
                      <Text size="sm">{`Expenses: ${formatCurrencyValue(cashflowReportSummary.totalExpenseCash)}`}</Text>
                      <Text size="sm">{`Net: ${formatCurrencyValue(cashflowReportSummary.netCashflow)}`}</Text>
                      <Text size="sm">{`Sales: ${String(cashflowReportSummary.saleCount)}`}</Text>
                      <Text size="sm">{`Expenses count: ${String(cashflowReportSummary.expenseCount)}`}</Text>
                    </Group>
                  ) : null}
                  {isManagerPanelOpen("cashflowReport") && cashflowReportError !== null ? (
                    <Text c="red">{cashflowReportError}</Text>
                  ) : null}
                  {isManagerPanelOpen("cashflowReport") ? (
                    <Stack gap="xs">
                      {cashflowReportRows.map((row) => (
                        <Card key={row.day} withBorder radius="md" padding="sm">
                          <Text size="sm">{row.day}</Text>
                          <Text size="xs" c="dimmed">
                            {`Sales: ${formatPointValue(row.salesPointsValue)} | Expenses: ${formatCurrencyValue(row.expenseCashTotal)} | Net: ${formatCurrencyValue(row.netCashflow)} | Sale events: ${String(row.saleCount)} | Expense events: ${String(row.expenseCount)}`}
                          </Text>
                        </Card>
                      ))}
                      {cashflowReportRows.length === 0 && !cashflowReportLoading ? (
                        <Text size="sm" c="dimmed">
                          No cashflow report rows found.
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
                  {isManagerPanelOpen("cashflowReport") ? <Divider /> : null}
                  {isManagerPanelOpen("cashflowReport") ? (
                    <Stack gap="xs">
                      {cashflowReportExpenseCategories.map((row) => (
                        <Card key={row.category} withBorder radius="md" padding="sm">
                          <Text size="sm">{row.category}</Text>
                          <Text size="xs" c="dimmed">
                            {`Expense total: ${formatCurrencyValue(row.totalCashAmount)} | Expense events: ${String(row.expenseCount)}`}
                          </Text>
                        </Card>
                      ))}
                      {cashflowReportExpenseCategories.length === 0 && !cashflowReportLoading ? (
                        <Text size="sm" c="dimmed">
                          No expense categories found.
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              {activeView === "collection-log" ? (
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
                              label: `${material.name} (${formatPointValue(material.pointsPerKg)} pts/kg)`,
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
                            {`Line ${String(index + 1)} points: ${intakeLinePreviews[index] === null || intakeLinePreviews[index] === undefined ? "-" : formatPointValue(intakeLinePreviews[index])}`}
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
                      {`Total preview points: ${formatPointValue(intakeTotalPreviewPoints)}`}
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
              ) : null}

              {showLedgerPanel ? (
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
                      {`Balance: ${ledgerBalanceText}`}
                    </Text>
                    <Stack gap="xs">
                      {ledgerEntries.map((entry) => (
                        <Card key={entry.id} withBorder radius="md" padding="sm">
                          <Text size="sm">{`${entry.sourceEventType} | ${entry.deltaPoints > 0 ? "+" : ""}${formatPointValue(entry.deltaPoints)}`}</Text>
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
              ) : null}
            </SimpleGrid>

            {activeView === "shop-log" ? (
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
                              label: `${item.name} (${formatPointValue(item.pointsPrice)} pts)`,
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
                    {`Sale total preview points: ${formatPointValue(saleTotalPreviewPoints)}`}
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
            ) : null}

            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              {activeView === "adjustments-points-request" ? (
                <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                  <Stack gap="sm">
                    <Title order={4}>Points Adjustment Request</Title>
                    <Select
                      label="Person"
                      data={people.map((person) => ({
                        value: person.id,
                        label: `${person.name} ${person.surname}`,
                      }))}
                      value={pointsAdjustmentPersonId}
                      onChange={setPointsAdjustmentPersonId}
                      searchable
                    />
                    <TextInput
                      label="Adjustment Points"
                      value={pointsAdjustmentDelta}
                      onChange={(event) => {
                        setPointsAdjustmentDelta(event.currentTarget.value);
                      }}
                    />
                    <TextInput
                      label="Adjustment Reason"
                      value={pointsAdjustmentReason}
                      onChange={(event) => {
                        setPointsAdjustmentReason(event.currentTarget.value);
                      }}
                    />
                    <Textarea
                      label="Notes"
                      value={pointsAdjustmentNotes}
                      onChange={(event) => {
                        setPointsAdjustmentNotes(event.currentTarget.value);
                      }}
                    />
                    {pointsAdjustmentError !== null ? (
                      <Text c="red">{pointsAdjustmentError}</Text>
                    ) : null}
                    <Button
                      onClick={() => {
                        void handlePointsAdjustmentRequest();
                      }}
                      loading={pointsAdjustmentPending}
                    >
                      Submit Points Adjustment Request
                    </Button>
                  </Stack>
                </Card>
              ) : null}

              {activeView === "adjustments-inventory-request" ? (
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
              ) : null}

              {activeView === "adjustments-points-apply" && canManageInventory ? (
                <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                  <Stack gap="sm">
                    <Title order={4}>Adjust Points</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void loadPendingAdjustmentRequests();
                      }}
                      loading={pendingRequestsLoading}
                    >
                      Refresh Pending Requests
                    </Button>
                    {pendingRequestsError !== null ? (
                      <Text c="red">{pendingRequestsError}</Text>
                    ) : null}
                    <Select
                      label="Related Request (optional)"
                      data={pendingAdjustmentRequests
                        .filter((request) => request.requestType === "points")
                        .map((request) => ({
                          value: request.requestEventId,
                          label: `${request.requestEventId} | ${request.reason}`,
                        }))}
                      value={applyPointsRequestEventId}
                      onChange={setApplyPointsRequestEventId}
                      clearable
                      searchable
                    />
                    <Select
                      label="Person"
                      data={people.map((person) => ({
                        value: person.id,
                        label: `${person.name} ${person.surname}`,
                      }))}
                      value={applyPointsPersonId}
                      onChange={setApplyPointsPersonId}
                      searchable
                      clearable
                    />
                    <TextInput
                      label="Adjustment Points"
                      value={applyPointsDelta}
                      onChange={(event) => {
                        setApplyPointsDelta(event.currentTarget.value);
                      }}
                    />
                    <TextInput
                      label="Reason"
                      value={applyPointsReason}
                      onChange={(event) => {
                        setApplyPointsReason(event.currentTarget.value);
                      }}
                    />
                    <Textarea
                      label="Notes"
                      value={applyPointsNotes}
                      onChange={(event) => {
                        setApplyPointsNotes(event.currentTarget.value);
                      }}
                    />
                    {applyPointsError !== null ? <Text c="red">{applyPointsError}</Text> : null}
                    <Button
                      onClick={() => {
                        void handlePointsAdjustmentApply();
                      }}
                      loading={applyPointsPending}
                    >
                      Adjust Points
                    </Button>
                  </Stack>
                </Card>
              ) : null}

              {activeView === "adjustments-inventory-apply" && canManageInventory ? (
                <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                  <Stack gap="sm">
                    <Title order={4}>Adjust Inventory</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void loadPendingAdjustmentRequests();
                      }}
                      loading={pendingRequestsLoading}
                    >
                      Refresh Pending Requests
                    </Button>
                    {pendingRequestsError !== null ? (
                      <Text c="red">{pendingRequestsError}</Text>
                    ) : null}
                    <Select
                      label="Related Request (optional)"
                      data={pendingAdjustmentRequests
                        .filter((request) => request.requestType === "inventory")
                        .map((request) => ({
                          value: request.requestEventId,
                          label: `${request.requestEventId} | ${request.reason}`,
                        }))}
                      value={applyInventoryRequestEventId}
                      onChange={setApplyInventoryRequestEventId}
                      clearable
                      searchable
                    />
                    <Select
                      label="Batch"
                      data={inventoryBatches.map((batch) => ({
                        value: batch.inventoryBatchId,
                        label: `${batch.inventoryBatchId}${batch.itemId !== null ? ` (${batch.itemId})` : ""}`,
                      }))}
                      value={applyInventoryBatchId}
                      onChange={setApplyInventoryBatchId}
                      searchable
                      clearable
                    />
                    <Select
                      label="From Status"
                      data={inventoryStatuses.map((status) => ({ value: status, label: status }))}
                      value={applyInventoryFromStatus}
                      onChange={(value) => {
                        if (value !== null) {
                          setApplyInventoryFromStatus(value as AdjustmentInventoryStatus);
                        }
                      }}
                    />
                    <Select
                      label="To Status"
                      data={inventoryStatuses.map((status) => ({ value: status, label: status }))}
                      value={applyInventoryToStatus}
                      onChange={(value) => {
                        if (value !== null) {
                          setApplyInventoryToStatus(value as AdjustmentInventoryStatus);
                        }
                      }}
                    />
                    <TextInput
                      label="Quantity"
                      value={applyInventoryQuantity}
                      onChange={(event) => {
                        setApplyInventoryQuantity(event.currentTarget.value);
                      }}
                    />
                    <TextInput
                      label="Reason"
                      value={applyInventoryReason}
                      onChange={(event) => {
                        setApplyInventoryReason(event.currentTarget.value);
                      }}
                    />
                    <Textarea
                      label="Notes"
                      value={applyInventoryNotes}
                      onChange={(event) => {
                        setApplyInventoryNotes(event.currentTarget.value);
                      }}
                    />
                    {applyInventoryError !== null ? (
                      <Text c="red">{applyInventoryError}</Text>
                    ) : null}
                    <Button
                      onClick={() => {
                        void handleInventoryAdjustmentApply();
                      }}
                      loading={applyInventoryPending}
                    >
                      Adjust Inventory
                    </Button>
                  </Stack>
                </Card>
              ) : null}

              {activeView === "users-list" && canManageUsers ? (
                <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                  <Stack gap="sm">
                    <Title order={4}>Users</Title>
                    <Button
                      variant="default"
                      onClick={() => {
                        void loadStaffUsers();
                      }}
                      loading={staffUsersLoading}
                    >
                      Refresh Users
                    </Button>
                    {staffUsersError !== null ? <Text c="red">{staffUsersError}</Text> : null}
                    {staffUsers.map((user) => (
                      <Card key={user.id} withBorder radius="md" padding="sm">
                        <Text size="sm">{`${user.username} (${user.role})`}</Text>
                      </Card>
                    ))}
                  </Stack>
                </Card>
              ) : null}

              {activeView === "users-create" && canManageUsers ? (
                <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                  <Stack gap="sm">
                    <Title order={4}>Add User</Title>
                    <TextInput
                      label="Username"
                      value={createUserUsername}
                      onChange={(event) => {
                        setCreateUserUsername(event.currentTarget.value);
                      }}
                    />
                    <Select
                      label="Role"
                      data={[
                        { value: "user", label: "user" },
                        { value: "administrator", label: "administrator" },
                      ]}
                      value={createUserRole}
                      onChange={(value) => {
                        if (value === "user" || value === "administrator") {
                          setCreateUserRole(value);
                        }
                      }}
                    />
                    <TextInput
                      label="Passcode"
                      value={createUserPasscode}
                      onChange={(event) => {
                        setCreateUserPasscode(event.currentTarget.value);
                      }}
                    />
                    {createUserError !== null ? <Text c="red">{createUserError}</Text> : null}
                    <Button
                      onClick={() => {
                        void handleCreateUser();
                      }}
                      loading={createUserPending}
                    >
                      Add new user
                    </Button>
                  </Stack>
                </Card>
              ) : null}

              {activeView === "users-edit" && canManageUsers ? (
                <Card className="sectionCard" shadow="sm" radius="md" padding="lg">
                  <Stack gap="sm">
                    <Title order={4}>Rename and edit user</Title>
                    <Select
                      label="User"
                      data={staffUsers.map((user) => ({
                        value: user.id,
                        label: `${user.username} (${user.role})`,
                      }))}
                      value={editUserId}
                      onChange={setEditUserId}
                      searchable
                      clearable
                    />
                    <TextInput
                      label="Username"
                      value={editUserUsername}
                      onChange={(event) => {
                        setEditUserUsername(event.currentTarget.value);
                      }}
                    />
                    <Select
                      label="Role"
                      data={[
                        { value: "user", label: "user" },
                        { value: "administrator", label: "administrator" },
                      ]}
                      value={editUserRole}
                      onChange={(value) => {
                        if (value === "user" || value === "administrator") {
                          setEditUserRole(value);
                        }
                      }}
                    />
                    <TextInput
                      label="New passcode (optional)"
                      value={editUserPasscode}
                      onChange={(event) => {
                        setEditUserPasscode(event.currentTarget.value);
                      }}
                    />
                    {editUserError !== null ? <Text c="red">{editUserError}</Text> : null}
                    <Button
                      onClick={() => {
                        void handleUpdateUser();
                      }}
                      loading={editUserPending}
                    >
                      Rename and edit user
                    </Button>
                  </Stack>
                </Card>
              ) : null}
            </SimpleGrid>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
};
