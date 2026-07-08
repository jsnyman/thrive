import { createApiClient } from "./api-client";

export type CollectionPointRecord = {
  id: string;
  name: string;
  isActive: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseCollectionPoint = (value: unknown): CollectionPointRecord => {
  if (!isRecord(value)) {
    throw new Error("Invalid collection point");
  }
  if (typeof value["id"] !== "string" || typeof value["name"] !== "string") {
    throw new Error("Invalid collection point");
  }
  if (typeof value["isActive"] !== "boolean") {
    throw new Error("Invalid collection point isActive");
  }
  return {
    id: value["id"],
    name: value["name"],
    isActive: value["isActive"],
  };
};

export const createCollectionPointsClient = (options?: {
  fetchFn?: typeof fetch;
  baseUrl?: string;
}) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const listCollectionPoints = async (): Promise<CollectionPointRecord[]> => {
    const response = await apiClient.request({
      method: "GET",
      path: "/collection-points",
    });
    if (!response.ok) {
      throw new Error(`Collection points fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "collection points list");
    if (!isRecord(body) || !Array.isArray(body["collectionPoints"])) {
      throw new Error("Invalid collection points response");
    }
    return body["collectionPoints"].map(parseCollectionPoint);
  };

  return {
    listCollectionPoints,
  };
};
