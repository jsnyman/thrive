import { createApiClient } from "./api-client";

export type MaterialRecord = {
  id: string;
  name: string;
  pointsPerKg: number;
  imageUpdatedAt?: string | null;
};

export type MaterialImageUploadResponse = {
  materialTypeId: string;
  contentType: string;
  fileName: string | null;
  fileSizeBytes: number;
  updatedAt: string;
};

export type MaterialImageResponse = {
  contentType: string;
  blob: Blob;
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
  if (
    value["imageUpdatedAt"] !== undefined &&
    value["imageUpdatedAt"] !== null &&
    typeof value["imageUpdatedAt"] !== "string"
  ) {
    throw new Error("Invalid material imageUpdatedAt");
  }
  return {
    id: value["id"],
    name: value["name"],
    pointsPerKg: value["pointsPerKg"],
    imageUpdatedAt: (value["imageUpdatedAt"] as string | null | undefined) ?? null,
  };
};

const parseMaterialImageUploadResponse = (value: unknown): MaterialImageUploadResponse => {
  if (!isRecord(value)) {
    throw new Error("Invalid material image response");
  }
  if (
    typeof value["materialTypeId"] !== "string" ||
    typeof value["contentType"] !== "string" ||
    (value["fileName"] !== null &&
      value["fileName"] !== undefined &&
      typeof value["fileName"] !== "string") ||
    typeof value["fileSizeBytes"] !== "number" ||
    typeof value["updatedAt"] !== "string"
  ) {
    throw new Error("Invalid material image response");
  }
  return {
    materialTypeId: value["materialTypeId"],
    contentType: value["contentType"],
    fileName: (value["fileName"] as string | null | undefined) ?? null,
    fileSizeBytes: value["fileSizeBytes"],
    updatedAt: value["updatedAt"],
  };
};

const requireOnlineForImageMutation = (): void => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Material image upload requires an online connection");
  }
};

export const createMaterialsClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const baseUrl = options?.baseUrl ?? "/api";
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    baseUrl,
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

  const uploadMaterialImage = async (
    materialTypeId: string,
    input: { contentType: string; fileName?: string | null; dataBase64: string },
  ): Promise<MaterialImageUploadResponse> => {
    requireOnlineForImageMutation();
    const response = await apiClient.request({
      method: "PUT",
      path: `/materials/${materialTypeId}/image`,
      body: input,
    });
    if (!response.ok) {
      throw new Error(`Material image upload failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "material image upload");
    return parseMaterialImageUploadResponse(body);
  };

  const readMaterialImage = async (materialTypeId: string): Promise<MaterialImageResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/materials/${materialTypeId}/image`,
    });
    if (!response.ok) {
      throw new Error(`Material image fetch failed with status ${String(response.status)}`);
    }
    return {
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      blob: await response.blob(),
    };
  };

  const getMaterialImageUrl = (material: MaterialRecord): string | null => {
    if (material.imageUpdatedAt === null || material.imageUpdatedAt === undefined) {
      return null;
    }
    const stamp = encodeURIComponent(material.imageUpdatedAt);
    return `${baseUrl}/materials/${material.id}/image?updatedAt=${stamp}`;
  };

  return {
    listMaterials,
    uploadMaterialImage,
    readMaterialImage,
    getMaterialImageUrl,
  };
};
