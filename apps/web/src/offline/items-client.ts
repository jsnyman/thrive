import { createApiClient } from "./api-client";

export type ItemRecord = {
  id: string;
  name: string;
  pointsPrice: number;
  costPrice?: number | null;
  sku?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseItem = (value: unknown): ItemRecord => {
  if (!isRecord(value)) {
    throw new Error("Invalid item");
  }
  if (typeof value["id"] !== "string" || typeof value["name"] !== "string") {
    throw new Error("Invalid item");
  }
  if (typeof value["pointsPrice"] !== "number" || !Number.isFinite(value["pointsPrice"])) {
    throw new Error("Invalid item pointsPrice");
  }
  if (
    value["costPrice"] !== undefined &&
    value["costPrice"] !== null &&
    typeof value["costPrice"] !== "number"
  ) {
    throw new Error("Invalid item costPrice");
  }
  if (value["sku"] !== undefined && value["sku"] !== null && typeof value["sku"] !== "string") {
    throw new Error("Invalid item sku");
  }
  return {
    id: value["id"],
    name: value["name"],
    pointsPrice: value["pointsPrice"],
    costPrice: (value["costPrice"] as number | null | undefined) ?? null,
    sku: (value["sku"] as string | null | undefined) ?? null,
  };
};

export const createItemsClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const listItems = async (): Promise<ItemRecord[]> => {
    const response = await apiClient.request({
      method: "GET",
      path: "/items",
    });
    if (!response.ok) {
      throw new Error(`Items fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "items list");
    if (!isRecord(body) || !Array.isArray(body["items"])) {
      throw new Error("Invalid items response");
    }
    return body["items"].map(parseItem);
  };

  return {
    listItems,
  };
};
