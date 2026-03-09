import { createApiClient } from "./api-client";

export type InventoryStatus = "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";

export type InventoryBatchState = {
  inventoryBatchId: string;
  itemId: string | null;
  quantities: Record<InventoryStatus, number>;
};

export type InventoryStatusSummary = {
  status: InventoryStatus;
  totalQuantity: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isInventoryStatus = (value: unknown): value is InventoryStatus =>
  value === "storage" ||
  value === "shop" ||
  value === "sold" ||
  value === "spoiled" ||
  value === "damaged" ||
  value === "missing";

const parseInventorySummary = (value: unknown): InventoryStatusSummary => {
  if (!isRecord(value)) {
    throw new Error("Invalid inventory summary");
  }
  if (!isInventoryStatus(value["status"]) || typeof value["totalQuantity"] !== "number") {
    throw new Error("Invalid inventory summary");
  }
  return {
    status: value["status"],
    totalQuantity: value["totalQuantity"],
  };
};

const parseInventoryBatch = (value: unknown): InventoryBatchState => {
  if (!isRecord(value)) {
    throw new Error("Invalid inventory batch");
  }
  const inventoryBatchId = value["inventoryBatchId"];
  const itemId = value["itemId"];
  const quantities = value["quantities"];
  if (typeof inventoryBatchId !== "string") {
    throw new Error("Invalid inventory batch");
  }
  if (itemId !== null && itemId !== undefined && typeof itemId !== "string") {
    throw new Error("Invalid inventory batch");
  }
  if (!isRecord(quantities)) {
    throw new Error("Invalid inventory batch quantities");
  }
  const statuses: InventoryStatus[] = ["storage", "shop", "sold", "spoiled", "damaged", "missing"];
  const parsedQuantities: Record<InventoryStatus, number> = {
    storage: 0,
    shop: 0,
    sold: 0,
    spoiled: 0,
    damaged: 0,
    missing: 0,
  };
  for (const status of statuses) {
    const quantity = quantities[status];
    if (typeof quantity !== "number") {
      throw new Error("Invalid inventory batch quantities");
    }
    parsedQuantities[status] = quantity;
  }
  return {
    inventoryBatchId,
    itemId: itemId === undefined ? null : (itemId ?? null),
    quantities: parsedQuantities,
  };
};

export const createInventoryClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const listStatusSummary = async (): Promise<InventoryStatusSummary[]> => {
    const response = await apiClient.request({
      method: "GET",
      path: "/inventory/status-summary",
    });
    if (!response.ok) {
      throw new Error(`Inventory summary fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "inventory summary");
    if (!isRecord(body) || !Array.isArray(body["summary"])) {
      throw new Error("Invalid inventory summary response");
    }
    return body["summary"].map(parseInventorySummary);
  };

  const listBatches = async (): Promise<InventoryBatchState[]> => {
    const response = await apiClient.request({
      method: "GET",
      path: "/inventory/batches",
    });
    if (!response.ok) {
      throw new Error(`Inventory batches fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "inventory batches");
    if (!isRecord(body) || !Array.isArray(body["batches"])) {
      throw new Error("Invalid inventory batches response");
    }
    return body["batches"].map(parseInventoryBatch);
  };

  return {
    listStatusSummary,
    listBatches,
  };
};
