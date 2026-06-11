import { createApiClient } from "./api-client";

export type ProcurementRecordLine = {
  itemId: string;
  inventoryBatchId: string;
  quantity: number;
  unitCost: number;
  lineTotalCost: number;
  unitSellingPrice: number;
  markupPercent: number;
};

export type ProcurementRecord = {
  procurementEventId: string;
  occurredAt: string;
  supplierName: string | null;
  tripDistanceKm: number | null;
  cashTotal: number;
  lines: ProcurementRecordLine[];
  isEditable: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseLine = (value: unknown): ProcurementRecordLine => {
  if (!isRecord(value)) {
    throw new Error("Invalid procurement line");
  }
  if (
    typeof value["itemId"] !== "string" ||
    typeof value["inventoryBatchId"] !== "string" ||
    typeof value["quantity"] !== "number" ||
    typeof value["unitCost"] !== "number" ||
    typeof value["lineTotalCost"] !== "number" ||
    typeof value["unitSellingPrice"] !== "number" ||
    typeof value["markupPercent"] !== "number"
  ) {
    throw new Error("Invalid procurement line");
  }
  return {
    itemId: value["itemId"],
    inventoryBatchId: value["inventoryBatchId"],
    quantity: value["quantity"],
    unitCost: value["unitCost"],
    lineTotalCost: value["lineTotalCost"],
    unitSellingPrice: value["unitSellingPrice"],
    markupPercent: value["markupPercent"],
  };
};

const parseProcurement = (value: unknown): ProcurementRecord => {
  if (!isRecord(value)) {
    throw new Error("Invalid procurement");
  }
  if (
    typeof value["procurementEventId"] !== "string" ||
    typeof value["occurredAt"] !== "string" ||
    (value["supplierName"] !== null &&
      value["supplierName"] !== undefined &&
      typeof value["supplierName"] !== "string") ||
    (value["tripDistanceKm"] !== null &&
      value["tripDistanceKm"] !== undefined &&
      typeof value["tripDistanceKm"] !== "number") ||
    typeof value["cashTotal"] !== "number" ||
    typeof value["isEditable"] !== "boolean" ||
    !Array.isArray(value["lines"])
  ) {
    throw new Error("Invalid procurement");
  }
  return {
    procurementEventId: value["procurementEventId"],
    occurredAt: value["occurredAt"],
    supplierName: (value["supplierName"] as string | null | undefined) ?? null,
    tripDistanceKm: (value["tripDistanceKm"] as number | null | undefined) ?? null,
    cashTotal: value["cashTotal"],
    lines: value["lines"].map(parseLine),
    isEditable: value["isEditable"],
  };
};

export const createProcurementClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient(options);

  const listProcurements = async (): Promise<ProcurementRecord[]> => {
    const response = await apiClient.request({
      method: "GET",
      path: "/procurements",
    });
    if (!response.ok) {
      throw new Error(`Procurements fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "procurements");
    if (!isRecord(body) || !Array.isArray(body["procurements"])) {
      throw new Error("Invalid procurements response");
    }
    return body["procurements"].map(parseProcurement);
  };

  const correctProcurement = async (
    procurementEventId: string,
    input: {
      occurredAt: string;
      supplierName: string | null;
      tripDistanceKm: number | null;
      reason: string;
      lines: Array<{
        itemId: string;
        inventoryBatchId?: string | null;
        quantity: number;
        unitCost: number;
        markupPercent: number;
      }>;
    },
  ): Promise<void> => {
    const response = await apiClient.request({
      method: "POST",
      path: `/procurements/${procurementEventId}/corrections`,
      body: input,
    });
    if (!response.ok) {
      throw new Error(`Procurement correction failed with status ${String(response.status)}`);
    }
  };

  return {
    listProcurements,
    correctProcurement,
  };
};
