import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  authenticateStaffUser,
  readAuthorizedActor,
  type AuthConfig,
  type PermissionAction,
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

type ApiServerDependencies = {
  authConfig: AuthConfig;
  getStaffUserByUsername: (username: string) => Promise<StaffUserRecord | null>;
  listPeople: (search?: string) => Promise<PersonRecord[]>;
  createPerson: (input: PersonCreateInput) => Promise<PersonRecord>;
  listMaterials: () => Promise<MaterialRecord[]>;
  createMaterial: (input: MaterialCreateInput) => Promise<MaterialRecord>;
  listItems: () => Promise<ItemRecord[]>;
  createItem: (input: ItemCreateInput) => Promise<ItemRecord>;
  getLedgerBalance: (personId: string) => Promise<LedgerBalanceRecord>;
  listLedgerEntries: (personId: string) => Promise<LedgerEntryRecord[]>;
  refreshProjections: () => Promise<void>;
  meRequiredAction?: PermissionAction;
  now?: () => Date;
};

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; error: "INVALID_JSON" | "BODY_TOO_LARGE" };

const MAX_BODY_BYTES = 16 * 1024;

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

const mapAuthErrorToStatus = (error: string): number => {
  if (error === "FORBIDDEN") {
    return 403;
  }
  return 401;
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
  const idNumber = record["idNumber"];
  const phone = record["phone"];
  const address = record["address"];
  const notes = record["notes"];
  if (idNumber !== undefined && idNumber !== null && typeof idNumber !== "string") {
    return null;
  }
  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    return null;
  }
  if (address !== undefined && address !== null && typeof address !== "string") {
    return null;
  }
  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return null;
  }
  return {
    name,
    surname,
    idNumber: (idNumber as string | null | undefined) ?? null,
    phone: (phone as string | null | undefined) ?? null,
    address: (address as string | null | undefined) ?? null,
    notes: (notes as string | null | undefined) ?? null,
  };
};

const parseMaterialCreateRequest = (body: unknown): MaterialCreateInput | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const name = record["name"];
  const pointsPerKg = record["pointsPerKg"];
  if (typeof name !== "string" || name.trim().length === 0) {
    return null;
  }
  if (typeof pointsPerKg !== "number" || !Number.isFinite(pointsPerKg) || pointsPerKg < 0) {
    return null;
  }
  return {
    name,
    pointsPerKg,
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
  if (typeof pointsPriceRaw !== "number" || !Number.isInteger(pointsPriceRaw) || pointsPriceRaw < 0) {
    return null;
  }
  const costPriceRaw = record["costPrice"];
  const skuRaw = record["sku"];
  if (costPriceRaw !== undefined && costPriceRaw !== null) {
    if (typeof costPriceRaw !== "number" || !Number.isFinite(costPriceRaw) || costPriceRaw < 0) {
      return null;
    }
  }
  if (skuRaw !== undefined && skuRaw !== null && typeof skuRaw !== "string") {
    return null;
  }
  return {
    name,
    pointsPrice: pointsPriceRaw,
    costPrice: (costPriceRaw as number | null | undefined) ?? null,
    sku: (skuRaw as string | null | undefined) ?? null,
  };
};

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

const handleMe = (req: IncomingMessage, res: ServerResponse, dependencies: ApiServerDependencies): void => {
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

const requireAuthorization = (
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ApiServerDependencies,
  action: PermissionAction,
) => {
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
  const person = await dependencies.createPerson(request);
  await dependencies.refreshProjections();
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
  const material = await dependencies.createMaterial(request);
  await dependencies.refreshProjections();
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
  const item = await dependencies.createItem(request);
  await dependencies.refreshProjections();
  sendJson(res, 201, { item });
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
