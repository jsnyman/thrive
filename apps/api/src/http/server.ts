import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type { Event } from "../../../../packages/shared/src/domain/events";
import {
  comparePointValues,
  floorPointsToTenths,
  isTenthsPointValue,
  multiplyPointValue,
  normalizePointValue,
  sumPointValues,
} from "../../../../packages/shared/src/domain/points";
import type {
  SyncAuditEventResponse,
  SyncAuditReportResponse,
  SyncReconciliationIssueCode,
  SyncReconciliationReportResponse,
  SyncRepairReconciliationIssueRequest,
  SyncRepairReconciliationIssueResponse,
  SyncConflictsResponse,
  SyncResolveConflictRequest,
  SyncResolveConflictResponse,
  SyncCursor,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncStatusResponse,
} from "../../../../packages/shared/src/domain/sync";
import {
  authenticateStaffUser,
  readAuthorizedActor,
  type AuthConfig,
  type PermissionAction,
  type StaffIdentity,
  type StaffUserRecord,
} from "../auth";

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
  locationText?: string | null;
};

type PersonUpdateInput = {
  updates: {
    name?: string;
    surname?: string;
    idNumber?: string | null;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
  };
  locationText?: string | null;
};

type MaterialRecord = {
  id: string;
  name: string;
  pointsPerKg: number;
};

type MaterialCreateInput = {
  name: string;
  pointsPerKg: number;
  locationText?: string | null;
};

type ItemRecord = {
  id: string;
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
};

type InventoryStatus = "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
type InventoryAdjustmentStatus = "spoiled" | "damaged" | "missing";

type InventoryBatchStateRecord = {
  inventoryBatchId: string;
  itemId: string | null;
  quantities: Record<InventoryStatus, number>;
};

type InventoryStatusSummaryRecord = {
  status: InventoryStatus;
  totalQuantity: number;
};

type ItemCreateInput = {
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
  locationText?: string | null;
};

type InventoryStatusChangeInput = {
  inventoryBatchId: string;
  fromStatus: InventoryStatus;
  toStatus: InventoryStatus;
  quantity: number;
  reason?: string | null;
  notes?: string | null;
  locationText?: string | null;
};

type InventoryAdjustmentRequestInput = {
  inventoryBatchId: string;
  requestedStatus: InventoryAdjustmentStatus;
  quantity: number;
  reason: string;
  notes?: string | null;
  locationText?: string | null;
};

type PointsAdjustmentRequestInput = {
  personId: string;
  deltaPoints: number;
  reason: string;
  notes?: string | null;
  locationText?: string | null;
};

type IntakeCreateInput = {
  personId: string;
  lines: Array<{
    materialTypeId: string;
    weightKg: number;
  }>;
  locationText?: string | null;
};

type SaleCreateInput = {
  personId: string;
  lines: Array<{
    itemId: string;
    inventoryBatchId?: string | null;
    quantity: number;
  }>;
  locationText?: string | null;
};

type ProcurementCreateInput = {
  supplierName?: string | null;
  tripDistanceKm?: number | null;
  lines: Array<{
    itemId: string;
    quantity: number;
    unitCost: number;
  }>;
  locationText?: string | null;
};

type BulkProcurementCreateInput = {
  supplierName?: string | null;
  tripDistanceKm?: number | null;
  rows: Array<{
    productName: string;
    quantity: number;
    lineTotalCost: number;
  }>;
  locationText?: string | null;
};

type ExpenseCreateInput = {
  category: string;
  cashAmount: number;
  notes?: string | null;
  receiptRef?: string | null;
  locationText?: string | null;
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

type MaterialsCollectedReportFilter = {
  fromDate: string | null;
  toDate: string | null;
  locationText: string | null;
  materialTypeId: string | null;
};

type MaterialsCollectedReportRow = {
  day: string;
  materialTypeId: string;
  materialName: string;
  locationText: string;
  totalWeightKg: number;
  totalPoints: number;
};

type SalesReportFilter = {
  fromDate: string | null;
  toDate: string | null;
  locationText: string | null;
  itemId: string | null;
};

type SalesReportRow = {
  day: string;
  itemId: string;
  itemName: string;
  locationText: string;
  totalQuantity: number;
  totalPoints: number;
  saleCount: number;
};

type SalesReportResult = {
  rows: SalesReportRow[];
  summary: {
    totalQuantity: number;
    totalPoints: number;
    saleCount: number;
  };
};

type CashflowReportFilter = {
  fromDate: string | null;
  toDate: string | null;
  locationText: string | null;
};

type CashflowReportRow = {
  day: string;
  salesPointsValue: number;
  expenseCashTotal: number;
  netCashflow: number;
  saleCount: number;
  expenseCount: number;
};

type CashflowExpenseCategoryRow = {
  category: string;
  totalCashAmount: number;
  expenseCount: number;
};

type CashflowReportResult = {
  rows: CashflowReportRow[];
  summary: {
    totalSalesPointsValue: number;
    totalExpenseCash: number;
    netCashflow: number;
    saleCount: number;
    expenseCount: number;
  };
  expenseCategories: CashflowExpenseCategoryRow[];
};

type PointsLiabilityReportFilter = {
  search: string | null;
};

type PointsLiabilityReportRow = {
  personId: string;
  name: string;
  surname: string;
  balancePoints: number;
};

type PointsLiabilityReportResult = {
  rows: PointsLiabilityReportRow[];
  summary: {
    totalOutstandingPoints: number;
    personCount: number;
  };
};

type InventoryStatusLogReportFilter = {
  fromDate: string | null;
  toDate: string | null;
  fromStatus: InventoryStatus | null;
  toStatus: InventoryStatus | null;
};

type InventoryStatusReportSummaryRow = {
  status: InventoryStatus;
  totalQuantity: number;
  totalCostValue: number;
};

type InventoryStatusReportRow = {
  status: InventoryStatus;
  itemId: string;
  itemName: string;
  quantity: number;
  unitCost: number;
  totalCostValue: number;
};

type InventoryStatusReportResult = {
  summary: InventoryStatusReportSummaryRow[];
  rows: InventoryStatusReportRow[];
};

type InventoryStatusLogReportRow = {
  eventId: string;
  eventType: "inventory.status_changed" | "inventory.adjustment_applied";
  occurredAt: string;
  inventoryBatchId: string;
  itemId: string | null;
  itemName: string | null;
  fromStatus: InventoryStatus;
  toStatus: InventoryStatus;
  quantity: number;
  reason: string | null;
  notes: string | null;
};

type AppendEventResult = {
  status: "accepted" | "duplicate" | "rejected";
  reason?: string;
};

type ApiServerDependencies = {
  authConfig: AuthConfig;
  getStaffUserByUsername: (username: string) => Promise<StaffUserRecord | null>;
  listPeople: (search?: string) => Promise<PersonRecord[]>;
  listMaterials: () => Promise<MaterialRecord[]>;
  listItems: () => Promise<ItemRecord[]>;
  listInventoryBatches: () => Promise<InventoryBatchStateRecord[]>;
  listShopBatchesForItem: (itemId: string) => Promise<InventoryBatchStateRecord[]>;
  listInventoryStatusSummary: () => Promise<InventoryStatusSummaryRecord[]>;
  getPersonById: (personId: string) => Promise<PersonRecord | null>;
  getMaterialById: (materialId: string) => Promise<MaterialRecord | null>;
  getItemById: (itemId: string) => Promise<ItemRecord | null>;
  getItemByName: (name: string) => Promise<ItemRecord | null>;
  getInventoryBatchState: (inventoryBatchId: string) => Promise<InventoryBatchStateRecord | null>;
  appendEventAndProject: (event: Event) => Promise<AppendEventResult>;
  appendEvents: (
    events: Event[],
    lastKnownCursor?: SyncCursor | null,
  ) => Promise<AppendEventResult[]>;
  listSyncConflicts: (
    status: "open" | "all",
    limit: number,
    cursor: SyncCursor | null,
  ) => Promise<SyncConflictsResponse>;
  resolveSyncConflict: (
    conflictId: string,
    request: SyncResolveConflictRequest,
    actor: StaffIdentity,
  ) => Promise<
    | { ok: true; value: SyncResolveConflictResponse }
    | { ok: false; error: "CONFLICT_NOT_FOUND" | "ALREADY_RESOLVED" | "BAD_REQUEST" }
  >;
  listSyncAuditReport: (
    limit: number,
    cursor: SyncCursor | null,
  ) => Promise<SyncAuditReportResponse>;
  getSyncAuditEvent: (eventId: string) => Promise<SyncAuditEventResponse | null>;
  listSyncReconciliationReport: (
    limit: number,
    cursor: SyncCursor | null,
    code: SyncReconciliationIssueCode | null,
    repairableOnly: boolean,
  ) => Promise<SyncReconciliationReportResponse>;
  repairSyncReconciliationIssue: (
    issueId: string,
    notes: string,
    actor: StaffIdentity,
  ) => Promise<
    | { ok: true; value: SyncRepairReconciliationIssueResponse }
    | { ok: false; error: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" }
  >;
  getLedgerBalance: (personId: string) => Promise<LedgerBalanceRecord>;
  listLedgerEntries: (personId: string) => Promise<LedgerEntryRecord[]>;
  getLivePointsBalance: (personId: string) => Promise<number>;
  listMaterialsCollectedReport: (
    filters: MaterialsCollectedReportFilter,
  ) => Promise<MaterialsCollectedReportRow[]>;
  listCashflowReport: (filters: CashflowReportFilter) => Promise<CashflowReportResult>;
  listSalesReport: (filters: SalesReportFilter) => Promise<SalesReportResult>;
  listPointsLiabilityReport: (
    filters: PointsLiabilityReportFilter,
  ) => Promise<PointsLiabilityReportResult>;
  listInventoryStatusReport: () => Promise<InventoryStatusReportResult>;
  listInventoryStatusLogReport: (
    filters: InventoryStatusLogReportFilter,
  ) => Promise<InventoryStatusLogReportRow[]>;
  pullEvents: (cursor: SyncCursor | null, limit: number) => Promise<SyncPullResponse>;
  getSyncStatus: () => Promise<SyncStatusResponse>;
  meRequiredAction?: PermissionAction;
  now?: () => Date;
};

type SaleAllocatedLine = {
  itemId: string;
  inventoryBatchId: string;
  quantity: number;
  pointsPrice: number;
  lineTotalPoints: number;
};

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; error: "INVALID_JSON" | "BODY_TOO_LARGE" };

const MAX_BODY_BYTES = 64 * 1024;

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown): void => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, name: string): string | undefined => {
  const raw = req.headers[name];
  if (raw === undefined) {
    return undefined;
  }
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
};

const readJsonBody = async (req: IncomingMessage): Promise<JsonBodyResult> => {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += chunkBuffer.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      return { ok: false, error: "BODY_TOO_LARGE" };
    }
    chunks.push(chunkBuffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (rawBody.trim().length === 0) {
    return { ok: true, value: {} };
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: "INVALID_JSON" };
  }
};

const parseLoginRequest = (body: unknown): { username: string; passcode: string } | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const username = record["username"];
  const passcode = record["passcode"];
  if (typeof username !== "string" || typeof passcode !== "string") {
    return null;
  }
  if (username.trim().length === 0 || passcode.trim().length === 0) {
    return null;
  }
  return { username, passcode };
};

const parseNullableString = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
};

const parseTenthsPointNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  if (!isTenthsPointValue(value)) {
    return null;
  }
  return normalizePointValue(value);
};

const maskSensitiveValue = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length <= 2) {
    return "****";
  }
  return `****${normalized.slice(-2)}`;
};

const toPersonResponse = (person: PersonRecord): PersonRecord => ({
  id: person.id,
  name: person.name,
  surname: person.surname,
  idNumber: maskSensitiveValue(person.idNumber),
  phone: maskSensitiveValue(person.phone),
  address: person.address ?? null,
  notes: person.notes ?? null,
});

const parsePersonCreateRequest = (body: unknown): PersonCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const name = record["name"];
  const surname = record["surname"];
  if (typeof name !== "string" || typeof surname !== "string") {
    return null;
  }
  if (name.trim().length === 0 || surname.trim().length === 0) {
    return null;
  }
  const idNumber = parseNullableString(record["idNumber"]);
  const phone = parseNullableString(record["phone"]);
  const address = parseNullableString(record["address"]);
  const notes = parseNullableString(record["notes"]);
  const locationText = parseNullableString(record["locationText"]);
  if (idNumber === undefined && record["idNumber"] !== undefined) {
    return null;
  }
  if (phone === undefined && record["phone"] !== undefined) {
    return null;
  }
  if (address === undefined && record["address"] !== undefined) {
    return null;
  }
  if (notes === undefined && record["notes"] !== undefined) {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    name,
    surname,
    idNumber: idNumber ?? null,
    phone: phone ?? null,
    address: address ?? null,
    notes: notes ?? null,
    locationText: locationText ?? null,
  };
};

const parsePersonUpdateRequest = (body: unknown): PersonUpdateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const updatesRaw = record["updates"];
  const locationText = parseNullableString(record["locationText"]);
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  if (typeof updatesRaw !== "object" || updatesRaw === null || Array.isArray(updatesRaw)) {
    return null;
  }
  const updatesRecord = updatesRaw as Record<string, unknown>;
  const updateKeys = Object.keys(updatesRecord);
  if (updateKeys.length === 0) {
    return null;
  }
  const allowedKeys = ["name", "surname", "idNumber", "phone", "address", "notes"];
  const hasInvalidKey = updateKeys.some((key) => !allowedKeys.includes(key));
  if (hasInvalidKey) {
    return null;
  }

  const updates: PersonUpdateInput["updates"] = {};

  if ("name" in updatesRecord) {
    const name = updatesRecord["name"];
    if (typeof name !== "string" || name.trim().length === 0) {
      return null;
    }
    updates.name = name;
  }
  if ("surname" in updatesRecord) {
    const surname = updatesRecord["surname"];
    if (typeof surname !== "string" || surname.trim().length === 0) {
      return null;
    }
    updates.surname = surname;
  }
  if ("idNumber" in updatesRecord) {
    const idNumber = parseNullableString(updatesRecord["idNumber"]);
    if (idNumber === undefined && updatesRecord["idNumber"] !== undefined) {
      return null;
    }
    updates.idNumber = idNumber ?? null;
  }
  if ("phone" in updatesRecord) {
    const phone = parseNullableString(updatesRecord["phone"]);
    if (phone === undefined && updatesRecord["phone"] !== undefined) {
      return null;
    }
    updates.phone = phone ?? null;
  }
  if ("address" in updatesRecord) {
    const address = parseNullableString(updatesRecord["address"]);
    if (address === undefined && updatesRecord["address"] !== undefined) {
      return null;
    }
    updates.address = address ?? null;
  }
  if ("notes" in updatesRecord) {
    const notes = parseNullableString(updatesRecord["notes"]);
    if (notes === undefined && updatesRecord["notes"] !== undefined) {
      return null;
    }
    updates.notes = notes ?? null;
  }

  return {
    updates,
    locationText: locationText ?? null,
  };
};

const parseMaterialCreateRequest = (body: unknown): MaterialCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const name = record["name"];
  const pointsPerKg = record["pointsPerKg"];
  const locationText = parseNullableString(record["locationText"]);
  if (typeof name !== "string" || name.trim().length === 0) {
    return null;
  }
  const normalizedPointsPerKg = parseTenthsPointNumber(pointsPerKg);
  if (normalizedPointsPerKg === null) {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    name,
    pointsPerKg: normalizedPointsPerKg,
    locationText: locationText ?? null,
  };
};

const parseItemCreateRequest = (body: unknown): ItemCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const name = record["name"];
  const normalizedPointsPrice = parseTenthsPointNumber(record["pointsPrice"]);
  if (typeof name !== "string" || name.trim().length === 0) {
    return null;
  }
  if (normalizedPointsPrice === null) {
    return null;
  }
  const costPriceRaw = record["costPrice"];
  const skuRaw = record["sku"];
  const locationText = parseNullableString(record["locationText"]);
  if (costPriceRaw !== undefined && costPriceRaw !== null) {
    if (typeof costPriceRaw !== "number" || !Number.isFinite(costPriceRaw) || costPriceRaw < 0) {
      return null;
    }
  }
  if (skuRaw !== undefined && skuRaw !== null && typeof skuRaw !== "string") {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    name,
    pointsPrice: normalizedPointsPrice,
    costPrice: (costPriceRaw as number | null | undefined) ?? null,
    sku: (skuRaw as string | null | undefined) ?? null,
    locationText: locationText ?? null,
  };
};

const parseIntakeCreateRequest = (body: unknown): IntakeCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const personId = record["personId"];
  const lines = record["lines"];
  const locationText = parseNullableString(record["locationText"]);
  if (typeof personId !== "string" || personId.trim().length === 0) {
    return null;
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return null;
  }
  const parsedLines: IntakeCreateInput["lines"] = [];
  for (const line of lines) {
    if (typeof line !== "object" || line === null || Array.isArray(line)) {
      return null;
    }
    const lineRecord = line as Record<string, unknown>;
    const materialTypeId = lineRecord["materialTypeId"];
    const weightKg = lineRecord["weightKg"];
    if (typeof materialTypeId !== "string" || materialTypeId.trim().length === 0) {
      return null;
    }
    if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0) {
      return null;
    }
    parsedLines.push({
      materialTypeId,
      weightKg,
    });
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    personId,
    lines: parsedLines,
    locationText: locationText ?? null,
  };
};

const parseSaleCreateRequest = (body: unknown): SaleCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const personId = record["personId"];
  const lines = record["lines"];
  const locationText = parseNullableString(record["locationText"]);
  if (typeof personId !== "string" || personId.trim().length === 0) {
    return null;
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return null;
  }
  const parsedLines: SaleCreateInput["lines"] = [];
  for (const line of lines) {
    if (typeof line !== "object" || line === null || Array.isArray(line)) {
      return null;
    }
    const lineRecord = line as Record<string, unknown>;
    const itemId = lineRecord["itemId"];
    const inventoryBatchId = lineRecord["inventoryBatchId"];
    const quantity = lineRecord["quantity"];
    if (typeof itemId !== "string" || itemId.trim().length === 0) {
      return null;
    }
    if (
      inventoryBatchId !== undefined &&
      inventoryBatchId !== null &&
      (typeof inventoryBatchId !== "string" || inventoryBatchId.trim().length === 0)
    ) {
      return null;
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      return null;
    }
    parsedLines.push({
      itemId,
      inventoryBatchId: inventoryBatchId === undefined ? null : inventoryBatchId,
      quantity,
    });
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    personId,
    lines: parsedLines,
    locationText: locationText ?? null,
  };
};

const parseProcurementCreateRequest = (body: unknown): ProcurementCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const supplierName = parseNullableString(record["supplierName"]);
  const tripDistanceKm = record["tripDistanceKm"];
  const lines = record["lines"];
  const locationText = parseNullableString(record["locationText"]);
  if (!Array.isArray(lines) || lines.length === 0) {
    return null;
  }
  const parsedLines: ProcurementCreateInput["lines"] = [];
  for (const line of lines) {
    if (typeof line !== "object" || line === null || Array.isArray(line)) {
      return null;
    }
    const lineRecord = line as Record<string, unknown>;
    const itemId = lineRecord["itemId"];
    const quantity = lineRecord["quantity"];
    const unitCost = lineRecord["unitCost"];
    if (typeof itemId !== "string" || itemId.trim().length === 0) {
      return null;
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      return null;
    }
    if (typeof unitCost !== "number" || !Number.isFinite(unitCost) || unitCost < 0) {
      return null;
    }
    parsedLines.push({
      itemId,
      quantity,
      unitCost,
    });
  }
  if (supplierName === undefined && record["supplierName"] !== undefined) {
    return null;
  }
  if (
    tripDistanceKm !== undefined &&
    tripDistanceKm !== null &&
    (typeof tripDistanceKm !== "number" || !Number.isFinite(tripDistanceKm) || tripDistanceKm < 0)
  ) {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    supplierName: supplierName ?? null,
    tripDistanceKm: (tripDistanceKm as number | null | undefined) ?? null,
    lines: parsedLines,
    locationText: locationText ?? null,
  };
};

const parseBulkProcurementCreateRequest = (body: unknown): BulkProcurementCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const supplierName = parseNullableString(record["supplierName"]);
  const tripDistanceKm = record["tripDistanceKm"];
  const rows = record["rows"];
  const locationText = parseNullableString(record["locationText"]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const parsedRows: BulkProcurementCreateInput["rows"] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      return null;
    }
    const rowRecord = row as Record<string, unknown>;
    const productName = rowRecord["productName"];
    const quantity = rowRecord["quantity"];
    const lineTotalCost = rowRecord["lineTotalCost"];
    if (typeof productName !== "string" || productName.trim().length === 0) {
      return null;
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      return null;
    }
    if (typeof lineTotalCost !== "number" || !Number.isFinite(lineTotalCost) || lineTotalCost < 0) {
      return null;
    }
    parsedRows.push({
      productName: productName.trim(),
      quantity,
      lineTotalCost,
    });
  }
  if (supplierName === undefined && record["supplierName"] !== undefined) {
    return null;
  }
  if (
    tripDistanceKm !== undefined &&
    tripDistanceKm !== null &&
    (typeof tripDistanceKm !== "number" || !Number.isFinite(tripDistanceKm) || tripDistanceKm < 0)
  ) {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    supplierName: supplierName ?? null,
    tripDistanceKm: (tripDistanceKm as number | null | undefined) ?? null,
    rows: parsedRows,
    locationText: locationText ?? null,
  };
};

const parseExpenseCreateRequest = (body: unknown): ExpenseCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const category = record["category"];
  const cashAmount = record["cashAmount"];
  const notes = parseNullableString(record["notes"]);
  const receiptRef = parseNullableString(record["receiptRef"]);
  const locationText = parseNullableString(record["locationText"]);
  if (typeof category !== "string" || category.trim().length === 0) {
    return null;
  }
  if (typeof cashAmount !== "number" || !Number.isFinite(cashAmount) || cashAmount < 0) {
    return null;
  }
  if (notes === undefined && record["notes"] !== undefined) {
    return null;
  }
  if (receiptRef === undefined && record["receiptRef"] !== undefined) {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    category,
    cashAmount,
    notes: notes ?? null,
    receiptRef: receiptRef ?? null,
    locationText: locationText ?? null,
  };
};

const isInventoryStatus = (value: unknown): value is InventoryStatus =>
  value === "storage" ||
  value === "shop" ||
  value === "sold" ||
  value === "spoiled" ||
  value === "damaged" ||
  value === "missing";

const isInventoryAdjustmentStatus = (value: unknown): value is InventoryAdjustmentStatus =>
  value === "spoiled" || value === "damaged" || value === "missing";

const parseInventoryStatusChangeRequest = (body: unknown): InventoryStatusChangeInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const inventoryBatchId = record["inventoryBatchId"];
  const fromStatus = record["fromStatus"];
  const toStatus = record["toStatus"];
  const quantity = record["quantity"];
  const reason = parseNullableString(record["reason"]);
  const notes = parseNullableString(record["notes"]);
  const locationText = parseNullableString(record["locationText"]);
  if (typeof inventoryBatchId !== "string" || inventoryBatchId.trim().length === 0) {
    return null;
  }
  if (!isInventoryStatus(fromStatus) || !isInventoryStatus(toStatus) || fromStatus === toStatus) {
    return null;
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    return null;
  }
  if (reason === undefined && record["reason"] !== undefined) {
    return null;
  }
  if (notes === undefined && record["notes"] !== undefined) {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    inventoryBatchId,
    fromStatus,
    toStatus,
    quantity,
    reason: reason ?? null,
    notes: notes ?? null,
    locationText: locationText ?? null,
  };
};

const parseInventoryAdjustmentRequest = (body: unknown): InventoryAdjustmentRequestInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const inventoryBatchId = record["inventoryBatchId"];
  const requestedStatus = record["requestedStatus"];
  const quantity = record["quantity"];
  const reason = record["reason"];
  const notes = parseNullableString(record["notes"]);
  const locationText = parseNullableString(record["locationText"]);
  if (typeof inventoryBatchId !== "string" || inventoryBatchId.trim().length === 0) {
    return null;
  }
  if (!isInventoryAdjustmentStatus(requestedStatus)) {
    return null;
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    return null;
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return null;
  }
  if (notes === undefined && record["notes"] !== undefined) {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    inventoryBatchId,
    requestedStatus,
    quantity,
    reason,
    notes: notes ?? null,
    locationText: locationText ?? null,
  };
};

const parsePointsAdjustmentRequest = (body: unknown): PointsAdjustmentRequestInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const personId = record["personId"];
  const deltaPoints = record["deltaPoints"];
  const reason = record["reason"];
  const notes = parseNullableString(record["notes"]);
  const locationText = parseNullableString(record["locationText"]);
  if (typeof personId !== "string" || personId.trim().length === 0) {
    return null;
  }
  if (typeof deltaPoints !== "number" || !isTenthsPointValue(deltaPoints) || deltaPoints === 0) {
    return null;
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return null;
  }
  if (notes === undefined && record["notes"] !== undefined) {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    personId,
    deltaPoints,
    reason,
    notes: notes ?? null,
    locationText: locationText ?? null,
  };
};

const parseSyncPushRequest = (body: unknown): SyncPushRequest | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const events = record["events"];
  const lastKnownCursor = record["lastKnownCursor"];
  if (!Array.isArray(events)) {
    return null;
  }
  if (
    lastKnownCursor !== undefined &&
    lastKnownCursor !== null &&
    typeof lastKnownCursor !== "string"
  ) {
    return null;
  }
  return {
    events: events as Event[],
    lastKnownCursor: (lastKnownCursor as SyncCursor | null | undefined) ?? null,
  };
};

const parseSyncConflictsStatus = (value: string | null): "open" | "all" => {
  if (value === "all") {
    return "all";
  }
  return "open";
};

const parseSyncConflictsLimit = (value: string | null): number => {
  const parsed = value === null ? 50 : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 50;
  }
  if (parsed > 200) {
    return 200;
  }
  return parsed;
};

const parseSyncAuditLimit = (value: string | null): number => {
  const parsed = value === null ? 50 : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 50;
  }
  if (parsed > 200) {
    return 200;
  }
  return parsed;
};

const parseSyncReconciliationIssueCode = (
  value: string | null,
): SyncReconciliationIssueCode | null => {
  if (
    value === "POINTS_BALANCE_MISMATCH" ||
    value === "INVENTORY_STATUS_SUMMARY_MISMATCH" ||
    value === "INVENTORY_BATCH_NEGATIVE_QUANTITY" ||
    value === "PROJECTION_CURSOR_DRIFT"
  ) {
    return value;
  }
  return null;
};

const parseBooleanQueryParam = (value: string | null): boolean | null => {
  if (value === null) {
    return false;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
};

const isIsoDateOnly = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.toISOString().slice(0, 10) === value;
};

const toDateOnlyString = (value: Date): string => value.toISOString().slice(0, 10);

const parseMaterialsCollectedReportFilter = (
  parsedUrl: URL,
  now: Date,
): MaterialsCollectedReportFilter | null => {
  const fromDateRaw = parsedUrl.searchParams.get("fromDate");
  const toDateRaw = parsedUrl.searchParams.get("toDate");
  const locationTextRaw = parsedUrl.searchParams.get("locationText");
  const materialTypeIdRaw = parsedUrl.searchParams.get("materialTypeId");

  const fromDate =
    fromDateRaw !== null && fromDateRaw.trim().length > 0 ? fromDateRaw.trim() : null;
  const toDate = toDateRaw !== null && toDateRaw.trim().length > 0 ? toDateRaw.trim() : null;
  const locationText =
    locationTextRaw !== null && locationTextRaw.trim().length > 0 ? locationTextRaw.trim() : null;
  const materialTypeId =
    materialTypeIdRaw !== null && materialTypeIdRaw.trim().length > 0
      ? materialTypeIdRaw.trim()
      : null;

  if (fromDate !== null && !isIsoDateOnly(fromDate)) {
    return null;
  }
  if (toDate !== null && !isIsoDateOnly(toDate)) {
    return null;
  }
  if (materialTypeId !== null && materialTypeId.length === 0) {
    return null;
  }

  const hasDateRange = fromDate !== null || toDate !== null;
  const normalizedFromDate = hasDateRange
    ? fromDate
    : toDateOnlyString(new Date(now.getTime() - 29 * 86400000));
  const normalizedToDate = hasDateRange ? toDate : toDateOnlyString(now);

  if (
    normalizedFromDate !== null &&
    normalizedToDate !== null &&
    normalizedFromDate > normalizedToDate
  ) {
    return null;
  }

  return {
    fromDate: normalizedFromDate,
    toDate: normalizedToDate,
    locationText,
    materialTypeId,
  };
};

const parsePointsLiabilityReportFilter = (parsedUrl: URL): PointsLiabilityReportFilter => {
  const searchRaw = parsedUrl.searchParams.get("search");
  const search = searchRaw !== null && searchRaw.trim().length > 0 ? searchRaw.trim() : null;
  return {
    search,
  };
};

const parseSalesReportFilter = (parsedUrl: URL, now: Date): SalesReportFilter | null => {
  const fromDateRaw = parsedUrl.searchParams.get("fromDate");
  const toDateRaw = parsedUrl.searchParams.get("toDate");
  const locationTextRaw = parsedUrl.searchParams.get("locationText");
  const itemIdRaw = parsedUrl.searchParams.get("itemId");

  const fromDate =
    fromDateRaw !== null && fromDateRaw.trim().length > 0 ? fromDateRaw.trim() : null;
  const toDate = toDateRaw !== null && toDateRaw.trim().length > 0 ? toDateRaw.trim() : null;
  const locationText =
    locationTextRaw !== null && locationTextRaw.trim().length > 0 ? locationTextRaw.trim() : null;
  const itemId = itemIdRaw !== null && itemIdRaw.trim().length > 0 ? itemIdRaw.trim() : null;

  if (fromDate !== null && !isIsoDateOnly(fromDate)) {
    return null;
  }
  if (toDate !== null && !isIsoDateOnly(toDate)) {
    return null;
  }

  const hasDateRange = fromDate !== null || toDate !== null;
  const normalizedFromDate = hasDateRange
    ? fromDate
    : toDateOnlyString(new Date(now.getTime() - 29 * 86400000));
  const normalizedToDate = hasDateRange ? toDate : toDateOnlyString(now);

  if (
    normalizedFromDate !== null &&
    normalizedToDate !== null &&
    normalizedFromDate > normalizedToDate
  ) {
    return null;
  }

  return {
    fromDate: normalizedFromDate,
    toDate: normalizedToDate,
    locationText,
    itemId,
  };
};

const parseCashflowReportFilter = (parsedUrl: URL, now: Date): CashflowReportFilter | null => {
  const fromDateRaw = parsedUrl.searchParams.get("fromDate");
  const toDateRaw = parsedUrl.searchParams.get("toDate");
  const locationTextRaw = parsedUrl.searchParams.get("locationText");

  const fromDate =
    fromDateRaw !== null && fromDateRaw.trim().length > 0 ? fromDateRaw.trim() : null;
  const toDate = toDateRaw !== null && toDateRaw.trim().length > 0 ? toDateRaw.trim() : null;
  const locationText =
    locationTextRaw !== null && locationTextRaw.trim().length > 0 ? locationTextRaw.trim() : null;

  if (fromDate !== null && !isIsoDateOnly(fromDate)) {
    return null;
  }
  if (toDate !== null && !isIsoDateOnly(toDate)) {
    return null;
  }

  const hasDateRange = fromDate !== null || toDate !== null;
  const normalizedFromDate = hasDateRange
    ? fromDate
    : toDateOnlyString(new Date(now.getTime() - 29 * 86400000));
  const normalizedToDate = hasDateRange ? toDate : toDateOnlyString(now);

  if (
    normalizedFromDate !== null &&
    normalizedToDate !== null &&
    normalizedFromDate > normalizedToDate
  ) {
    return null;
  }

  return {
    fromDate: normalizedFromDate,
    toDate: normalizedToDate,
    locationText,
  };
};

const parseInventoryStatusLogReportFilter = (
  parsedUrl: URL,
  now: Date,
): InventoryStatusLogReportFilter | null => {
  const fromDateRaw = parsedUrl.searchParams.get("fromDate");
  const toDateRaw = parsedUrl.searchParams.get("toDate");
  const fromStatusRaw = parsedUrl.searchParams.get("fromStatus");
  const toStatusRaw = parsedUrl.searchParams.get("toStatus");

  const fromDate =
    fromDateRaw !== null && fromDateRaw.trim().length > 0 ? fromDateRaw.trim() : null;
  const toDate = toDateRaw !== null && toDateRaw.trim().length > 0 ? toDateRaw.trim() : null;
  const fromStatus =
    fromStatusRaw !== null && fromStatusRaw.trim().length > 0 ? fromStatusRaw.trim() : null;
  const toStatus =
    toStatusRaw !== null && toStatusRaw.trim().length > 0 ? toStatusRaw.trim() : null;

  if (fromDate !== null && !isIsoDateOnly(fromDate)) {
    return null;
  }
  if (toDate !== null && !isIsoDateOnly(toDate)) {
    return null;
  }
  if (fromStatus !== null && !isInventoryStatus(fromStatus)) {
    return null;
  }
  if (toStatus !== null && !isInventoryStatus(toStatus)) {
    return null;
  }

  const hasDateRange = fromDate !== null || toDate !== null;
  const normalizedFromDate = hasDateRange
    ? fromDate
    : toDateOnlyString(new Date(now.getTime() - 29 * 86400000));
  const normalizedToDate = hasDateRange ? toDate : toDateOnlyString(now);

  if (
    normalizedFromDate !== null &&
    normalizedToDate !== null &&
    normalizedFromDate > normalizedToDate
  ) {
    return null;
  }

  return {
    fromDate: normalizedFromDate,
    toDate: normalizedToDate,
    fromStatus,
    toStatus,
  };
};

const parseResolveConflictRequest = (body: unknown): SyncResolveConflictRequest | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const resolution = record["resolution"];
  const notes = record["notes"];
  const resolvedEventId = record["resolvedEventId"];
  const relatedEventIds = record["relatedEventIds"];
  if (resolution !== "accepted" && resolution !== "rejected" && resolution !== "merged") {
    return null;
  }
  if (typeof notes !== "string" || notes.trim().length === 0) {
    return null;
  }
  if (
    resolvedEventId !== undefined &&
    resolvedEventId !== null &&
    typeof resolvedEventId !== "string"
  ) {
    return null;
  }
  if (relatedEventIds !== undefined && relatedEventIds !== null) {
    if (!Array.isArray(relatedEventIds)) {
      return null;
    }
    for (const id of relatedEventIds) {
      if (typeof id !== "string") {
        return null;
      }
    }
  }
  return {
    resolution,
    notes,
    resolvedEventId: (resolvedEventId as string | null | undefined) ?? null,
    relatedEventIds: (relatedEventIds as string[] | null | undefined) ?? null,
  };
};

const parseRepairReconciliationIssueRequest = (
  body: unknown,
): SyncRepairReconciliationIssueRequest | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record["notes"] !== "string" || record["notes"].trim().length === 0) {
    return null;
  }
  return {
    notes: record["notes"],
  };
};

const mapAuthErrorToStatus = (error: string): number => {
  if (error === "FORBIDDEN") {
    return 403;
  }
  return 401;
};

const requireAuthorization = (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
  action: PermissionAction,
): StaffIdentity | null => {
  const authorization = getHeader(req, "authorization");
  const actor = readAuthorizedActor(
    {
      authorization,
    },
    dependencies.authConfig,
    action,
    dependencies.now?.() ?? new Date(),
  );
  if (!actor.ok) {
    sendJson(res, mapAuthErrorToStatus(actor.error), { error: actor.error });
    return null;
  }
  return actor.value;
};

const nowIso = (dependencies: ApiServerDependencies): string =>
  (dependencies.now?.() ?? new Date()).toISOString();

const toBaseEventFields = (
  dependencies: ApiServerDependencies,
  actor: StaffIdentity,
  req: IncomingMessage,
  locationText?: string | null,
): Pick<
  Event,
  | "eventId"
  | "occurredAt"
  | "actorUserId"
  | "deviceId"
  | "schemaVersion"
  | "correlationId"
  | "causationId"
  | "locationText"
> => ({
  eventId: randomUUID(),
  occurredAt: nowIso(dependencies),
  actorUserId: actor.id,
  deviceId: getHeader(req, "x-device-id") ?? "api-server",
  schemaVersion: 1,
  correlationId: null,
  causationId: null,
  locationText: locationText ?? null,
});

const handleLogin = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const loginRequest = parseLoginRequest(bodyResult.value);
  if (loginRequest === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }

  const result = await authenticateStaffUser(
    dependencies.getStaffUserByUsername,
    loginRequest,
    dependencies.authConfig,
    dependencies.now?.() ?? new Date(),
  );

  if (!result.ok) {
    sendJson(res, 401, { error: "UNAUTHORIZED" });
    return;
  }

  sendJson(res, 200, {
    user: result.value.user,
    token: result.value.token,
  });
};

const handleMe = (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): void => {
  const authorization = getHeader(req, "authorization");
  const requiredAction = dependencies.meRequiredAction ?? "person.update";
  const actor = readAuthorizedActor(
    {
      authorization,
    },
    dependencies.authConfig,
    requiredAction,
    dependencies.now?.() ?? new Date(),
  );

  if (!actor.ok) {
    const statusCode = mapAuthErrorToStatus(actor.error);
    sendJson(res, statusCode, { error: actor.error });
    return;
  }

  sendJson(res, 200, {
    user: actor.value,
  });
};

const handlePeopleList = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.read");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const searchParam = parsedUrl.searchParams.get("search") ?? undefined;
  const people = await dependencies.listPeople(searchParam);
  sendJson(res, 200, { people: people.map(toPersonResponse) });
};

const handlePeopleCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.create");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parsePersonCreateRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }

  const personId = randomUUID();
  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "person.created",
    payload: {
      personId,
      name: request.name,
      surname: request.surname,
      idNumber: request.idNumber ?? null,
      phone: request.phone ?? null,
      address: request.address ?? null,
      notes: request.notes ?? null,
      locationText: request.locationText ?? null,
    },
  };

  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }

  const person = await dependencies.getPersonById(personId);
  if (person === null) {
    sendJson(res, 500, { error: "INTERNAL_SERVER_ERROR" });
    return;
  }

  sendJson(res, 201, { person: toPersonResponse(person) });
};

const handlePeopleUpdate = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
  personId: string,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.update");
  if (actor === null) {
    return;
  }
  const person = await dependencies.getPersonById(personId);
  if (person === null) {
    sendJson(res, 404, { error: "PERSON_NOT_FOUND" });
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parsePersonUpdateRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }

  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "person.profile_updated",
    payload: {
      personId,
      updates: request.updates,
    },
  };
  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }

  const updated = await dependencies.getPersonById(personId);
  if (updated === null) {
    sendJson(res, 500, { error: "INTERNAL_SERVER_ERROR" });
    return;
  }
  sendJson(res, 200, { person: toPersonResponse(updated) });
};

const handleMaterialsList = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.update");
  if (actor === null) {
    return;
  }
  const materials = await dependencies.listMaterials();
  sendJson(res, 200, { materials });
};

const handleMaterialsCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "item.manage");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseMaterialCreateRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }

  const materialTypeId = randomUUID();
  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "material_type.created",
    payload: {
      materialTypeId,
      name: request.name,
      pointsPerKg: request.pointsPerKg,
    },
  };

  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  const material = await dependencies.getMaterialById(materialTypeId);
  if (material === null) {
    sendJson(res, 500, { error: "INTERNAL_SERVER_ERROR" });
    return;
  }
  sendJson(res, 201, { material });
};

const handleItemsList = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.update");
  if (actor === null) {
    return;
  }
  const items = await dependencies.listItems();
  sendJson(res, 200, { items });
};

const handleItemsCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "item.manage");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseItemCreateRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }

  const itemId = randomUUID();
  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "item.created",
    payload: {
      itemId,
      name: request.name,
      pointsPrice: request.pointsPrice,
      costPrice: request.costPrice ?? null,
      sku: request.sku ?? null,
    },
  };

  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  const item = await dependencies.getItemById(itemId);
  if (item === null) {
    sendJson(res, 500, { error: "INTERNAL_SERVER_ERROR" });
    return;
  }
  sendJson(res, 201, { item });
};

const handleInventoryStatusSummary = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "inventory.read");
  if (actor === null) {
    return;
  }
  const summary = await dependencies.listInventoryStatusSummary();
  sendJson(res, 200, { summary });
};

const handleInventoryBatches = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "inventory.read");
  if (actor === null) {
    return;
  }
  const batches = await dependencies.listInventoryBatches();
  sendJson(res, 200, { batches });
};

const handleInventoryStatusChange = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "inventory.move");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseInventoryStatusChangeRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const batch = await dependencies.getInventoryBatchState(request.inventoryBatchId);
  if (batch === null) {
    sendJson(res, 404, { error: "INVENTORY_BATCH_NOT_FOUND" });
    return;
  }
  const availableQuantity = batch.quantities[request.fromStatus];
  if (availableQuantity < request.quantity) {
    sendJson(res, 409, {
      error: "INVENTORY_UNDERFLOW",
      availableQuantity,
      requestedQuantity: request.quantity,
    });
    return;
  }
  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "inventory.status_changed",
    payload: {
      inventoryBatchId: request.inventoryBatchId,
      fromStatus: request.fromStatus,
      toStatus: request.toStatus,
      quantity: request.quantity,
      reason: request.reason ?? null,
      notes: request.notes ?? null,
    },
  };
  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  sendJson(res, 201, {
    inventoryBatchId: request.inventoryBatchId,
    fromStatus: request.fromStatus,
    toStatus: request.toStatus,
    quantity: request.quantity,
  });
};

const handleInventoryAdjustmentRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "inventory.adjustment.request");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseInventoryAdjustmentRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const batch = await dependencies.getInventoryBatchState(request.inventoryBatchId);
  if (batch === null) {
    sendJson(res, 404, { error: "INVENTORY_BATCH_NOT_FOUND" });
    return;
  }
  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "inventory.adjustment_requested",
    payload: {
      inventoryBatchId: request.inventoryBatchId,
      requestedStatus: request.requestedStatus,
      quantity: request.quantity,
      reason: request.reason,
      notes: request.notes ?? null,
    },
  };
  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  sendJson(res, 201, {
    requestEventId: event.eventId,
  });
};

const handlePointsAdjustmentRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "points.adjustment.request");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parsePointsAdjustmentRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const person = await dependencies.getPersonById(request.personId);
  if (person === null) {
    sendJson(res, 404, { error: "PERSON_NOT_FOUND" });
    return;
  }
  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "points.adjustment_requested",
    payload: {
      personId: request.personId,
      deltaPoints: request.deltaPoints,
      reason: request.reason,
      notes: request.notes ?? null,
    },
  };
  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  sendJson(res, 201, {
    requestEventId: event.eventId,
  });
};

const handleIntakeCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "intake.record");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseIntakeCreateRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const person = await dependencies.getPersonById(request.personId);
  if (person === null) {
    sendJson(res, 404, { error: "PERSON_NOT_FOUND" });
    return;
  }

  const lines: Array<{
    materialTypeId: string;
    weightKg: number;
    pointsPerKg: number;
    pointsAwarded: number;
  }> = [];
  let totalPoints = 0;
  for (const line of request.lines) {
    const material = await dependencies.getMaterialById(line.materialTypeId);
    if (material === null) {
      sendJson(res, 404, { error: "MATERIAL_NOT_FOUND" });
      return;
    }
    const pointsAwarded = floorPointsToTenths(line.weightKg * material.pointsPerKg);
    totalPoints = sumPointValues([totalPoints, pointsAwarded]);
    lines.push({
      materialTypeId: line.materialTypeId,
      weightKg: line.weightKg,
      pointsPerKg: material.pointsPerKg,
      pointsAwarded,
    });
  }

  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "intake.recorded",
    payload: {
      personId: request.personId,
      lines,
      totalPoints,
      locationText: request.locationText ?? null,
    },
  };

  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  sendJson(res, 201, {
    personId: person.id,
    totalPoints,
  });
};

const buildSaleAllocatedLines = async (
  dependencies: ApiServerDependencies,
  request: SaleCreateInput,
): Promise<
  | { ok: true; lines: SaleAllocatedLine[]; totalPoints: number }
  | {
      ok: false;
      status: 404 | 409;
      body:
        | { error: "ITEM_NOT_FOUND" }
        | { error: "INVENTORY_BATCH_NOT_FOUND" }
        | { error: "INVENTORY_BATCH_ITEM_MISMATCH"; itemId: string; inventoryBatchId: string }
        | {
            error: "INSUFFICIENT_STOCK";
            itemId: string;
            requiredQuantity: number;
            availableQuantity: number;
          };
    }
> => {
  const allocatedLines: SaleAllocatedLine[] = [];
  let totalPoints = 0;

  for (const line of request.lines) {
    const item = await dependencies.getItemById(line.itemId);
    if (item === null) {
      return { ok: false, status: 404, body: { error: "ITEM_NOT_FOUND" } };
    }
    if (line.inventoryBatchId !== null && line.inventoryBatchId !== undefined) {
      const batch = await dependencies.getInventoryBatchState(line.inventoryBatchId);
      if (batch === null) {
        return { ok: false, status: 404, body: { error: "INVENTORY_BATCH_NOT_FOUND" } };
      }
      if (batch.itemId !== line.itemId) {
        return {
          ok: false,
          status: 409,
          body: {
            error: "INVENTORY_BATCH_ITEM_MISMATCH",
            itemId: line.itemId,
            inventoryBatchId: line.inventoryBatchId,
          },
        };
      }
      const available = batch.quantities.shop;
      if (available < line.quantity) {
        return {
          ok: false,
          status: 409,
          body: {
            error: "INSUFFICIENT_STOCK",
            itemId: line.itemId,
            requiredQuantity: line.quantity,
            availableQuantity: available,
          },
        };
      }
      const lineTotalPoints = multiplyPointValue(item.pointsPrice, line.quantity);
      totalPoints = sumPointValues([totalPoints, lineTotalPoints]);
      allocatedLines.push({
        itemId: line.itemId,
        inventoryBatchId: line.inventoryBatchId,
        quantity: line.quantity,
        pointsPrice: item.pointsPrice,
        lineTotalPoints,
      });
      continue;
    }

    const shopBatches = await dependencies.listShopBatchesForItem(line.itemId);
    const totalAvailable = shopBatches.reduce((sum, batch) => sum + batch.quantities.shop, 0);
    if (totalAvailable < line.quantity) {
      return {
        ok: false,
        status: 409,
        body: {
          error: "INSUFFICIENT_STOCK",
          itemId: line.itemId,
          requiredQuantity: line.quantity,
          availableQuantity: totalAvailable,
        },
      };
    }
    let remaining = line.quantity;
    for (const batch of shopBatches) {
      if (remaining <= 0) {
        break;
      }
      const alloc = Math.min(remaining, batch.quantities.shop);
      if (alloc <= 0) {
        continue;
      }
      const lineTotalPoints = multiplyPointValue(item.pointsPrice, alloc);
      totalPoints = sumPointValues([totalPoints, lineTotalPoints]);
      allocatedLines.push({
        itemId: line.itemId,
        inventoryBatchId: batch.inventoryBatchId,
        quantity: alloc,
        pointsPrice: item.pointsPrice,
        lineTotalPoints,
      });
      remaining -= alloc;
    }
  }

  return { ok: true, lines: allocatedLines, totalPoints };
};

const handleSaleCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "sale.record");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseSaleCreateRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const person = await dependencies.getPersonById(request.personId);
  if (person === null) {
    sendJson(res, 404, { error: "PERSON_NOT_FOUND" });
    return;
  }

  const allocation = await buildSaleAllocatedLines(dependencies, request);
  if (!allocation.ok) {
    sendJson(res, allocation.status, allocation.body);
    return;
  }
  const lines = allocation.lines;
  const totalPoints = allocation.totalPoints;

  const currentBalance = await dependencies.getLivePointsBalance(request.personId);
  if (comparePointValues(currentBalance, totalPoints) < 0) {
    sendJson(res, 409, {
      error: "INSUFFICIENT_POINTS",
      balancePoints: normalizePointValue(currentBalance),
      requestedPoints: normalizePointValue(totalPoints),
    });
    return;
  }

  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "sale.recorded",
    payload: {
      personId: request.personId,
      lines,
      totalPoints,
      locationText: request.locationText ?? null,
    },
  };

  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  sendJson(res, 201, {
    personId: person.id,
    totalPoints,
  });
};

const handleProcurementCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "procurement.record");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseProcurementCreateRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }

  const lines: Array<{
    itemId: string;
    inventoryBatchId: string;
    quantity: number;
    unitCost: number;
    lineTotalCost: number;
  }> = [];
  let cashTotal = 0;
  for (const line of request.lines) {
    const item = await dependencies.getItemById(line.itemId);
    if (item === null) {
      sendJson(res, 404, { error: "ITEM_NOT_FOUND" });
      return;
    }
    const lineTotalCost = line.quantity * line.unitCost;
    cashTotal += lineTotalCost;
    lines.push({
      itemId: line.itemId,
      inventoryBatchId: randomUUID(),
      quantity: line.quantity,
      unitCost: line.unitCost,
      lineTotalCost,
    });
  }

  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "procurement.recorded",
    payload: {
      supplierName: request.supplierName ?? null,
      tripDistanceKm: request.tripDistanceKm ?? null,
      cashTotal,
      lines,
    },
  };
  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  sendJson(res, 201, {
    eventId: event.eventId,
    cashTotal,
    lines,
  });
};

const handleBulkProcurementCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "procurement.record");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseBulkProcurementCreateRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }

  const missingRows: Array<{ index: number; productName: string }> = [];
  const lines: Array<{
    itemId: string;
    inventoryBatchId: string;
    quantity: number;
    unitCost: number;
    lineTotalCost: number;
  }> = [];
  let cashTotal = 0;

  for (let index = 0; index < request.rows.length; index += 1) {
    const row = request.rows[index];
    if (row === undefined) {
      continue;
    }
    const item = await dependencies.getItemByName(row.productName);
    if (item === null) {
      missingRows.push({
        index,
        productName: row.productName,
      });
      continue;
    }
    const unitCost = row.lineTotalCost / row.quantity;
    cashTotal += row.lineTotalCost;
    lines.push({
      itemId: item.id,
      inventoryBatchId: randomUUID(),
      quantity: row.quantity,
      unitCost,
      lineTotalCost: row.lineTotalCost,
    });
  }

  if (missingRows.length > 0) {
    sendJson(res, 400, {
      error: "ITEM_NOT_FOUND",
      rows: missingRows,
    });
    return;
  }

  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "procurement.recorded",
    payload: {
      supplierName: request.supplierName ?? null,
      tripDistanceKm: request.tripDistanceKm ?? null,
      cashTotal,
      lines,
    },
  };
  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  sendJson(res, 201, {
    eventId: event.eventId,
    cashTotal,
    lines,
  });
};

const handleExpenseCreate = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "expense.record");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseExpenseCreateRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const event: Event = {
    ...toBaseEventFields(dependencies, actor, req, request.locationText),
    eventType: "expense.recorded",
    payload: {
      category: request.category,
      cashAmount: request.cashAmount,
      notes: request.notes ?? null,
      receiptRef: request.receiptRef ?? null,
    },
  };
  const appendResult = await dependencies.appendEventAndProject(event);
  if (appendResult.status !== "accepted") {
    sendJson(res, 400, { error: "BAD_REQUEST", reason: appendResult.reason ?? null });
    return;
  }
  sendJson(res, 201, {
    eventId: event.eventId,
    expense: {
      category: request.category,
      cashAmount: request.cashAmount,
      notes: request.notes ?? null,
      receiptRef: request.receiptRef ?? null,
    },
  });
};

const handleLedgerBalance = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
  personId: string,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.update");
  if (actor === null) {
    return;
  }
  const balance = await dependencies.getLedgerBalance(personId);
  sendJson(res, 200, { balance });
};

const handleLedgerEntries = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
  personId: string,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.update");
  if (actor === null) {
    return;
  }
  const entries = await dependencies.listLedgerEntries(personId);
  sendJson(res, 200, { entries });
};

const handleSyncPush = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.update");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseSyncPushRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const appendResults = await dependencies.appendEvents(
    request.events,
    request.lastKnownCursor ?? null,
  );
  const status = await dependencies.getSyncStatus();
  const response: SyncPushResponse = {
    acknowledgements: request.events.map((event, index) => {
      const result = appendResults[index];
      if (result?.reason !== undefined) {
        return {
          eventId: event.eventId,
          status: result.status,
          reason: result.reason,
        };
      }
      return {
        eventId: event.eventId,
        status: result?.status ?? "rejected",
      };
    }),
    latestCursor: status.latestCursor,
  };
  sendJson(res, 200, response);
};

const handleSyncPull = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.update");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const cursor = parsedUrl.searchParams.get("cursor");
  const limitRaw = parsedUrl.searchParams.get("limit");
  const parsedLimit = limitRaw === null ? 100 : Number.parseInt(limitRaw, 10);
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 100;
  const result = await dependencies.pullEvents(cursor, limit);
  sendJson(res, 200, result);
};

const handleSyncStatus = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "person.update");
  if (actor === null) {
    return;
  }
  const status = await dependencies.getSyncStatus();
  sendJson(res, 200, status);
};

const handleSyncConflictsList = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "conflict.view");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const status = parseSyncConflictsStatus(parsedUrl.searchParams.get("status"));
  const limit = parseSyncConflictsLimit(parsedUrl.searchParams.get("limit"));
  const cursor = parsedUrl.searchParams.get("cursor");
  const response = await dependencies.listSyncConflicts(status, limit, cursor);
  sendJson(res, 200, response);
};

const handleSyncConflictResolve = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
  conflictId: string,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "conflict.resolve");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseResolveConflictRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const result = await dependencies.resolveSyncConflict(conflictId, request, actor);
  if (!result.ok) {
    if (result.error === "CONFLICT_NOT_FOUND") {
      sendJson(res, 404, { error: result.error });
      return;
    }
    if (result.error === "ALREADY_RESOLVED") {
      sendJson(res, 409, { error: result.error });
      return;
    }
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  sendJson(res, 200, result.value);
};

const handleSyncAuditReport = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "audit.view");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const limit = parseSyncAuditLimit(parsedUrl.searchParams.get("limit"));
  const cursor = parsedUrl.searchParams.get("cursor");
  const report = await dependencies.listSyncAuditReport(limit, cursor);
  sendJson(res, 200, report);
};

const handleSyncAuditEvent = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
  eventId: string,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "audit.view");
  if (actor === null) {
    return;
  }
  const result = await dependencies.getSyncAuditEvent(eventId);
  if (result === null) {
    sendJson(res, 404, { error: "NOT_FOUND" });
    return;
  }
  sendJson(res, 200, result);
};

const handleSyncReconciliationReport = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "audit.view");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const limit = parseSyncAuditLimit(parsedUrl.searchParams.get("limit"));
  const cursor = parsedUrl.searchParams.get("cursor");
  const codeRaw = parsedUrl.searchParams.get("code");
  const repairableOnlyRaw = parseBooleanQueryParam(parsedUrl.searchParams.get("repairableOnly"));
  if (repairableOnlyRaw === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  if (codeRaw !== null && parseSyncReconciliationIssueCode(codeRaw) === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const report = await dependencies.listSyncReconciliationReport(
    limit,
    cursor,
    parseSyncReconciliationIssueCode(codeRaw),
    repairableOnlyRaw,
  );
  sendJson(res, 200, report);
};

const handleSyncReconciliationIssueRepair = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
  issueId: string,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "audit.view");
  if (actor === null) {
    return;
  }
  const bodyResult = await readJsonBody(req);
  if (!bodyResult.ok) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const request = parseRepairReconciliationIssueRequest(bodyResult.value);
  if (request === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const result = await dependencies.repairSyncReconciliationIssue(issueId, request.notes, actor);
  if (!result.ok) {
    if (result.error === "NOT_FOUND") {
      sendJson(res, 404, { error: "NOT_FOUND" });
      return;
    }
    if (result.error === "CONFLICT") {
      sendJson(res, 409, { error: "CONFLICT" });
      return;
    }
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  sendJson(res, 200, result.value);
};

const handleMaterialsCollectedReport = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "reports.view");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const filters = parseMaterialsCollectedReportFilter(
    parsedUrl,
    dependencies.now?.() ?? new Date(),
  );
  if (filters === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const rows = await dependencies.listMaterialsCollectedReport(filters);
  sendJson(res, 200, {
    rows,
    appliedFilters: filters,
  });
};

const handlePointsLiabilityReport = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "reports.view");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const filters = parsePointsLiabilityReportFilter(parsedUrl);
  const report = await dependencies.listPointsLiabilityReport(filters);
  sendJson(res, 200, {
    rows: report.rows,
    summary: report.summary,
    appliedFilters: filters,
  });
};

const handleSalesReport = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "reports.view");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const filters = parseSalesReportFilter(parsedUrl, dependencies.now?.() ?? new Date());
  if (filters === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const report = await dependencies.listSalesReport(filters);
  sendJson(res, 200, {
    rows: report.rows,
    summary: report.summary,
    appliedFilters: filters,
  });
};

const handleCashflowReport = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "reports.view");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const filters = parseCashflowReportFilter(parsedUrl, dependencies.now?.() ?? new Date());
  if (filters === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const report = await dependencies.listCashflowReport(filters);
  sendJson(res, 200, {
    rows: report.rows,
    summary: report.summary,
    expenseCategories: report.expenseCategories,
    appliedFilters: filters,
  });
};

const handleInventoryStatusReport = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "reports.view");
  if (actor === null) {
    return;
  }
  const report = await dependencies.listInventoryStatusReport();
  sendJson(res, 200, report);
};

const handleInventoryStatusLogReport = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const actor = requireAuthorization(req, res, dependencies, "reports.view");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const filters = parseInventoryStatusLogReportFilter(
    parsedUrl,
    dependencies.now?.() ?? new Date(),
  );
  if (filters === null) {
    sendJson(res, 400, { error: "BAD_REQUEST" });
    return;
  }
  const rows = await dependencies.listInventoryStatusLogReport(filters);
  sendJson(res, 200, {
    rows,
    appliedFilters: filters,
  });
};

const routeRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
): Promise<void> => {
  const method = req.method ?? "GET";
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const pathname = parsedUrl.pathname;

  if (method === "POST" && pathname === "/auth/login") {
    await handleLogin(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/auth/me") {
    handleMe(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/people") {
    await handlePeopleList(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/people") {
    await handlePeopleCreate(req, res, dependencies);
    return;
  }

  const peopleUpdateMatch = pathname.match(/^\/people\/([^/]+)$/);
  if (method === "PATCH" && peopleUpdateMatch !== null) {
    const personId = peopleUpdateMatch[1];
    if (personId !== undefined) {
      await handlePeopleUpdate(req, res, dependencies, personId);
      return;
    }
  }

  if (method === "GET" && pathname === "/materials") {
    await handleMaterialsList(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/materials") {
    await handleMaterialsCreate(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/items") {
    await handleItemsList(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/items") {
    await handleItemsCreate(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/inventory/status-summary") {
    await handleInventoryStatusSummary(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/inventory/batches") {
    await handleInventoryBatches(req, res, dependencies);
    return;
  }
  if (method === "GET" && pathname === "/reports/materials-collected") {
    await handleMaterialsCollectedReport(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/reports/points-liability") {
    await handlePointsLiabilityReport(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/reports/sales") {
    await handleSalesReport(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/reports/cashflow") {
    await handleCashflowReport(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/reports/inventory-status") {
    await handleInventoryStatusReport(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/reports/inventory-status-log") {
    await handleInventoryStatusLogReport(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/inventory/status-changes") {
    await handleInventoryStatusChange(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/inventory/adjustments/requests") {
    await handleInventoryAdjustmentRequest(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/points/adjustments/requests") {
    await handlePointsAdjustmentRequest(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/intakes") {
    await handleIntakeCreate(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/sales") {
    await handleSaleCreate(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/procurements") {
    await handleProcurementCreate(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/procurements/bulk") {
    await handleBulkProcurementCreate(req, res, dependencies);
    return;
  }
  if (method === "POST" && pathname === "/expenses") {
    await handleExpenseCreate(req, res, dependencies);
    return;
  }

  const ledgerBalanceMatch = pathname.match(/^\/ledger\/([^/]+)\/balance$/);
  if (method === "GET" && ledgerBalanceMatch !== null) {
    const personId = ledgerBalanceMatch[1];
    if (personId !== undefined) {
      await handleLedgerBalance(req, res, dependencies, personId);
      return;
    }
  }

  const ledgerEntriesMatch = pathname.match(/^\/ledger\/([^/]+)\/entries$/);
  if (method === "GET" && ledgerEntriesMatch !== null) {
    const personId = ledgerEntriesMatch[1];
    if (personId !== undefined) {
      await handleLedgerEntries(req, res, dependencies, personId);
      return;
    }
  }

  if (method === "POST" && pathname === "/sync/push") {
    await handleSyncPush(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/sync/pull") {
    await handleSyncPull(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/sync/status") {
    await handleSyncStatus(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/sync/conflicts") {
    await handleSyncConflictsList(req, res, dependencies);
    return;
  }

  const resolveConflictMatch = pathname.match(/^\/sync\/conflicts\/([^/]+)\/resolve$/);
  if (method === "POST" && resolveConflictMatch !== null) {
    const conflictId = resolveConflictMatch[1];
    if (conflictId !== undefined) {
      await handleSyncConflictResolve(req, res, dependencies, conflictId);
      return;
    }
  }

  if (method === "GET" && pathname === "/sync/audit/report") {
    await handleSyncAuditReport(req, res, dependencies);
    return;
  }

  if (method === "GET" && pathname === "/sync/reconciliation/report") {
    await handleSyncReconciliationReport(req, res, dependencies);
    return;
  }

  const auditEventMatch = pathname.match(/^\/sync\/audit\/event\/([^/]+)$/);
  if (method === "GET" && auditEventMatch !== null) {
    const eventId = auditEventMatch[1];
    if (eventId !== undefined) {
      await handleSyncAuditEvent(req, res, dependencies, eventId);
      return;
    }
  }

  const repairReconciliationIssueMatch = pathname.match(
    /^\/sync\/reconciliation\/issues\/([^/]+)\/repair$/,
  );
  if (method === "POST" && repairReconciliationIssueMatch !== null) {
    const issueId = repairReconciliationIssueMatch[1];
    if (issueId !== undefined) {
      await handleSyncReconciliationIssueRepair(req, res, dependencies, issueId);
      return;
    }
  }

  sendJson(res, 404, { error: "NOT_FOUND" });
};

export const createApiServer = (dependencies: ApiServerDependencies): Server => {
  const server = createServer((req, res) => {
    void routeRequest(req, res, dependencies).catch(() => {
      sendJson(res, 500, { error: "INTERNAL_SERVER_ERROR" });
    });
  });
  return server;
};

export type { ApiServerDependencies };
