import { createApiClient } from "./api-client";

export type LedgerBalance = {
  personId: string;
  balancePoints: number;
};

export type LedgerEntry = {
  id: string;
  personId: string;
  deltaPoints: number;
  occurredAt: string;
  sourceEventType: string;
  sourceEventId: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseLedgerBalance = (value: unknown): LedgerBalance => {
  if (!isRecord(value)) {
    throw new Error("Invalid ledger balance");
  }
  if (typeof value["personId"] !== "string" || typeof value["balancePoints"] !== "number") {
    throw new Error("Invalid ledger balance");
  }
  return {
    personId: value["personId"],
    balancePoints: value["balancePoints"],
  };
};

const parseLedgerEntry = (value: unknown): LedgerEntry => {
  if (!isRecord(value)) {
    throw new Error("Invalid ledger entry");
  }
  if (
    typeof value["id"] !== "string" ||
    typeof value["personId"] !== "string" ||
    typeof value["deltaPoints"] !== "number" ||
    typeof value["occurredAt"] !== "string" ||
    typeof value["sourceEventType"] !== "string" ||
    typeof value["sourceEventId"] !== "string"
  ) {
    throw new Error("Invalid ledger entry");
  }
  return {
    id: value["id"],
    personId: value["personId"],
    deltaPoints: value["deltaPoints"],
    occurredAt: value["occurredAt"],
    sourceEventType: value["sourceEventType"],
    sourceEventId: value["sourceEventId"],
  };
};

export const createLedgerClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const getBalance = async (personId: string): Promise<LedgerBalance> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/ledger/${encodeURIComponent(personId)}/balance`,
    });
    if (!response.ok) {
      throw new Error(`Ledger balance fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "ledger balance");
    if (!isRecord(body) || !isRecord(body["balance"])) {
      throw new Error("Invalid ledger balance response");
    }
    return parseLedgerBalance(body["balance"]);
  };

  const listEntries = async (personId: string): Promise<LedgerEntry[]> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/ledger/${encodeURIComponent(personId)}/entries`,
    });
    if (!response.ok) {
      throw new Error(`Ledger entries fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "ledger entries");
    if (!isRecord(body) || !Array.isArray(body["entries"])) {
      throw new Error("Invalid ledger entries response");
    }
    return body["entries"].map(parseLedgerEntry);
  };

  return {
    getBalance,
    listEntries,
  };
};
