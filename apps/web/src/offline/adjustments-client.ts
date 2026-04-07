import { createApiClient } from "./api-client";

export type AdjustmentRequestType = "points" | "inventory";
export type AdjustmentRequestStatus = "pending" | "approved" | "rejected";
export type InventoryStatus = "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
export type InventoryAdjustmentStatus = "spoiled" | "damaged" | "missing";

export type AdjustmentRequestRecord = {
  requestEventId: string;
  requestType: AdjustmentRequestType;
  status: AdjustmentRequestStatus;
  requestedAt: string;
  requestedByUserId: string;
  personId: string | null;
  inventoryBatchId: string | null;
  requestedStatus: InventoryAdjustmentStatus | null;
  deltaPoints: number | null;
  quantity: number;
  reason: string;
  notes: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
};

type ListAdjustmentRequestsResponse = {
  requests: AdjustmentRequestRecord[];
  nextCursor: string | null;
};

type RequestEventResponse = {
  requestEventId: string;
};

type ApplyEventResponse = {
  eventId: string;
};

const isAdjustmentRequestRecord = (value: unknown): value is AdjustmentRequestRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["requestEventId"] === "string" &&
    (record["requestType"] === "points" || record["requestType"] === "inventory") &&
    (record["status"] === "pending" ||
      record["status"] === "approved" ||
      record["status"] === "rejected") &&
    typeof record["requestedAt"] === "string" &&
    typeof record["requestedByUserId"] === "string" &&
    typeof record["reason"] === "string"
  );
};

const toQuery = (filters?: {
  requestType?: AdjustmentRequestType | null;
  status?: AdjustmentRequestStatus | null;
  limit?: number;
  cursor?: string | null;
}): string => {
  if (filters === undefined) {
    return "";
  }
  const params = new URLSearchParams();
  if (filters.requestType !== undefined && filters.requestType !== null) {
    params.set("type", filters.requestType);
  }
  if (filters.status !== undefined && filters.status !== null) {
    params.set("status", filters.status);
  }
  if (filters.limit !== undefined) {
    params.set("limit", String(filters.limit));
  }
  if (filters.cursor !== undefined && filters.cursor !== null && filters.cursor.length > 0) {
    params.set("cursor", filters.cursor);
  }
  const query = params.toString();
  if (query.length === 0) {
    return "";
  }
  return `?${query}`;
};

export const createAdjustmentsClient = (options?: { fetchFn?: typeof fetch; baseUrl?: string }) => {
  const apiClient = createApiClient(options);

  const listRequests = async (filters?: {
    requestType?: AdjustmentRequestType | null;
    status?: AdjustmentRequestStatus | null;
    limit?: number;
    cursor?: string | null;
  }): Promise<ListAdjustmentRequestsResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/adjustments/requests${toQuery(filters)}`,
    });
    if (!response.ok) {
      throw new Error(`Adjustment requests fetch failed with status ${String(response.status)}`);
    }
    const body = await apiClient.readJson<unknown>(response, "adjustment requests");
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("Invalid adjustment requests response");
    }
    const record = body as Record<string, unknown>;
    if (
      !Array.isArray(record["requests"]) ||
      !record["requests"].every(isAdjustmentRequestRecord)
    ) {
      throw new Error("Invalid adjustment requests response");
    }
    if (
      record["nextCursor"] !== null &&
      record["nextCursor"] !== undefined &&
      typeof record["nextCursor"] !== "string"
    ) {
      throw new Error("Invalid adjustment requests response");
    }
    return {
      requests: record["requests"] as AdjustmentRequestRecord[],
      nextCursor: (record["nextCursor"] as string | null | undefined) ?? null,
    };
  };

  const requestPointsAdjustment = async (input: {
    personId: string;
    deltaPoints: number;
    reason: string;
    notes?: string | null;
  }): Promise<RequestEventResponse> => {
    const response = await apiClient.request({
      method: "POST",
      path: "/points/adjustments/requests",
      body: input,
    });
    if (!response.ok) {
      throw new Error(`Points adjustment request failed with status ${String(response.status)}`);
    }
    return apiClient.readJson<RequestEventResponse>(response, "points adjustment request");
  };

  const requestInventoryAdjustment = async (input: {
    inventoryBatchId: string;
    requestedStatus: InventoryAdjustmentStatus;
    quantity: number;
    reason: string;
    notes?: string | null;
  }): Promise<RequestEventResponse> => {
    const response = await apiClient.request({
      method: "POST",
      path: "/inventory/adjustments/requests",
      body: input,
    });
    if (!response.ok) {
      throw new Error(`Inventory adjustment request failed with status ${String(response.status)}`);
    }
    return apiClient.readJson<RequestEventResponse>(response, "inventory adjustment request");
  };

  const applyPointsAdjustment = async (input: {
    requestEventId?: string | null;
    personId: string;
    deltaPoints: number;
    reason: string;
    notes?: string | null;
  }): Promise<ApplyEventResponse> => {
    const response = await apiClient.request({
      method: "POST",
      path: "/points/adjustments/apply",
      body: input,
    });
    if (!response.ok) {
      throw new Error(`Points adjustment apply failed with status ${String(response.status)}`);
    }
    return apiClient.readJson<ApplyEventResponse>(response, "points adjustment apply");
  };

  const applyInventoryAdjustment = async (input: {
    requestEventId?: string | null;
    inventoryBatchId: string;
    fromStatus: InventoryStatus;
    toStatus: InventoryStatus;
    quantity: number;
    reason: string;
    notes?: string | null;
  }): Promise<ApplyEventResponse> => {
    const response = await apiClient.request({
      method: "POST",
      path: "/inventory/adjustments/apply",
      body: input,
    });
    if (!response.ok) {
      throw new Error(`Inventory adjustment apply failed with status ${String(response.status)}`);
    }
    return apiClient.readJson<ApplyEventResponse>(response, "inventory adjustment apply");
  };

  return {
    listRequests,
    requestPointsAdjustment,
    requestInventoryAdjustment,
    applyPointsAdjustment,
    applyInventoryAdjustment,
  };
};
