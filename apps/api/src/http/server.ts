import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type { Event } from "../../../../packages/shared/src/domain/events";
import type {
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

type ItemCreateInput = {
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
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
    quantity: number;
  }>;
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
  getPersonById: (personId: string) => Promise<PersonRecord | null>;
  getMaterialById: (materialId: string) => Promise<MaterialRecord | null>;
  getItemById: (itemId: string) => Promise<ItemRecord | null>;
  appendEventAndProject: (event: Event) => Promise<AppendEventResult>;
  appendEvents: (events: Event[]) => Promise<AppendEventResult[]>;
  getLedgerBalance: (personId: string) => Promise<LedgerBalanceRecord>;
  listLedgerEntries: (personId: string) => Promise<LedgerEntryRecord[]>;
  getLivePointsBalance: (personId: string) => Promise<number>;
  pullEvents: (cursor: SyncCursor | null, limit: number) => Promise<SyncPullResponse>;
  getSyncStatus: () => Promise<SyncStatusResponse>;
  meRequiredAction?: PermissionAction;
  now?: () => Date;
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
  if (typeof pointsPerKg !== "number" || !Number.isFinite(pointsPerKg) || pointsPerKg < 0) {
    return null;
  }
  if (locationText === undefined && record["locationText"] !== undefined) {
    return null;
  }
  return {
    name,
    pointsPerKg,
    locationText: locationText ?? null,
  };
};

const parseItemCreateRequest = (body: unknown): ItemCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const name = record["name"];
  const pointsPriceRaw = record["pointsPrice"];
  if (typeof name !== "string" || name.trim().length === 0) {
    return null;
  }
  if (
    typeof pointsPriceRaw !== "number" ||
    !Number.isInteger(pointsPriceRaw) ||
    pointsPriceRaw < 0
  ) {
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
    pointsPrice: pointsPriceRaw,
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
    const quantity = lineRecord["quantity"];
    if (typeof itemId !== "string" || itemId.trim().length === 0) {
      return null;
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      return null;
    }
    parsedLines.push({
      itemId,
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
  const actor = requireAuthorization(req, res, dependencies, "person.update");
  if (actor === null) {
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  const searchParam = parsedUrl.searchParams.get("search") ?? undefined;
  const people = await dependencies.listPeople(searchParam);
  sendJson(res, 200, { people });
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

  sendJson(res, 201, { person });
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
    const pointsAwarded = Math.floor(line.weightKg * material.pointsPerKg);
    totalPoints += pointsAwarded;
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

  const lines: Array<{
    itemId: string;
    inventoryBatchId: null;
    quantity: number;
    pointsPrice: number;
    lineTotalPoints: number;
  }> = [];
  let totalPoints = 0;
  for (const line of request.lines) {
    const item = await dependencies.getItemById(line.itemId);
    if (item === null) {
      sendJson(res, 404, { error: "ITEM_NOT_FOUND" });
      return;
    }
    const lineTotalPoints = item.pointsPrice * line.quantity;
    totalPoints += lineTotalPoints;
    lines.push({
      itemId: line.itemId,
      inventoryBatchId: null,
      quantity: line.quantity,
      pointsPrice: item.pointsPrice,
      lineTotalPoints,
    });
  }

  const currentBalance = await dependencies.getLivePointsBalance(request.personId);
  if (currentBalance - totalPoints < 0) {
    sendJson(res, 409, {
      error: "INSUFFICIENT_POINTS",
      balancePoints: currentBalance,
      requestedPoints: totalPoints,
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
  const appendResults = await dependencies.appendEvents(request.events);
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

  if (method === "POST" && pathname === "/intakes") {
    await handleIntakeCreate(req, res, dependencies);
    return;
  }

  if (method === "POST" && pathname === "/sales") {
    await handleSaleCreate(req, res, dependencies);
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
