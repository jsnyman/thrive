import { createApiClient } from "./api-client";

export type MaterialRecord = {
  id: string;
  name: string;
  pointsPerKg: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseMaterial = (value: unknown): MaterialRecord => {
  if (!isRecord(value)) {
    throw new Error("Invalid material");
  }
  if (typeof value["id"] !== "string" || typeof value["name"] !== "string") {
    throw new Error("Invalid material");
  }
  if (typeof value["pointsPerKg"] !== "number" || !Number.isFinite(value["pointsPerKg"])) {
    throw new Error("Invalid material pointsPerKg");
  }
  return {
    id: value["id"],
    name: value["name"],
    pointsPerKg: value["pointsPerKg"],
  };
};

export const createMaterialsClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const listMaterials = async (): Promise<MaterialRecord[]> => {
    const response = await apiClient.request({
      method: "GET",
      path: "/materials",
    });
    if (!response.ok) {
      throw new Error(`Materials fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "materials list");
    if (!isRecord(body) || !Array.isArray(body["materials"])) {
      throw new Error("Invalid materials response");
    }
    return body["materials"].map(parseMaterial);
  };

  return {
    listMaterials,
  };
};
