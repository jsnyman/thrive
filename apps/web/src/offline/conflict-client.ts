import type {
  SyncConflictsResponse,
  SyncResolveConflictRequest,
  SyncResolveConflictResponse,
} from "../../../../packages/shared/src/domain/sync";
import { createApiClient } from "./api-client";

type JsonRecord = Record<string, unknown>;

type ConflictClientOptions = {
  fetchFn?: typeof fetch;
  baseUrl?: string;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseConflictRecord = (value: unknown): SyncConflictsResponse["conflicts"][number] => {
  if (!isRecord(value)) {
    throw new Error("Invalid sync conflict record");
  }
  const detectedEventIds = value["detectedEventIds"];
  if (!Array.isArray(detectedEventIds) || !detectedEventIds.every((id) => typeof id === "string")) {
    throw new Error("Invalid sync conflict record detectedEventIds");
  }
  const summaryRaw = value["summary"];
  const resolvedAtRaw = value["resolvedAt"];
  const resolutionRaw = value["resolution"];
  const resolutionEventIdRaw = value["resolutionEventId"];
  const resolutionNotesRaw = value["resolutionNotes"];
  const resolvedByUserIdRaw = value["resolvedByUserId"];
  if (typeof value["conflictId"] !== "string" || typeof value["detectedEventId"] !== "string") {
    throw new Error("Invalid sync conflict record ids");
  }
  if (typeof value["detectedAt"] !== "string") {
    throw new Error("Invalid sync conflict record detectedAt");
  }
  if (
    value["entityType"] !== "person" &&
    value["entityType"] !== "intake" &&
    value["entityType"] !== "sale" &&
    value["entityType"] !== "procurement" &&
    value["entityType"] !== "expense" &&
    value["entityType"] !== "inventory_batch" &&
    value["entityType"] !== "points_ledger"
  ) {
    throw new Error("Invalid sync conflict record entityType");
  }
  if (typeof value["entityId"] !== "string" || typeof value["resolved"] !== "boolean") {
    throw new Error("Invalid sync conflict record entity fields");
  }
  if (summaryRaw !== null && summaryRaw !== undefined && typeof summaryRaw !== "string") {
    throw new Error("Invalid sync conflict record summary");
  }
  if (resolvedAtRaw !== null && resolvedAtRaw !== undefined && typeof resolvedAtRaw !== "string") {
    throw new Error("Invalid sync conflict record resolvedAt");
  }
  if (
    resolutionRaw !== null &&
    resolutionRaw !== undefined &&
    resolutionRaw !== "accepted" &&
    resolutionRaw !== "rejected" &&
    resolutionRaw !== "merged"
  ) {
    throw new Error("Invalid sync conflict record resolution");
  }
  if (
    resolutionEventIdRaw !== null &&
    resolutionEventIdRaw !== undefined &&
    typeof resolutionEventIdRaw !== "string"
  ) {
    throw new Error("Invalid sync conflict record resolutionEventId");
  }
  if (
    resolutionNotesRaw !== null &&
    resolutionNotesRaw !== undefined &&
    typeof resolutionNotesRaw !== "string"
  ) {
    throw new Error("Invalid sync conflict record resolutionNotes");
  }
  if (
    resolvedByUserIdRaw !== null &&
    resolvedByUserIdRaw !== undefined &&
    typeof resolvedByUserIdRaw !== "string"
  ) {
    throw new Error("Invalid sync conflict record resolvedByUserId");
  }
  return {
    conflictId: value["conflictId"],
    detectedEventId: value["detectedEventId"],
    detectedAt: value["detectedAt"],
    entityType: value["entityType"],
    entityId: value["entityId"],
    detectedEventIds,
    summary: (summaryRaw as string | null | undefined) ?? null,
    resolved: value["resolved"],
    resolvedAt: (resolvedAtRaw as string | null | undefined) ?? null,
    resolution: (resolutionRaw as "accepted" | "rejected" | "merged" | null | undefined) ?? null,
    resolutionEventId: (resolutionEventIdRaw as string | null | undefined) ?? null,
    resolutionNotes: (resolutionNotesRaw as string | null | undefined) ?? null,
    resolvedByUserId: (resolvedByUserIdRaw as string | null | undefined) ?? null,
  };
};

const parseConflictsResponse = (value: unknown): SyncConflictsResponse => {
  if (!isRecord(value) || !Array.isArray(value["conflicts"])) {
    throw new Error("Invalid sync conflicts response");
  }
  const nextCursorRaw = value["nextCursor"];
  if (nextCursorRaw !== null && nextCursorRaw !== undefined && typeof nextCursorRaw !== "string") {
    throw new Error("Invalid sync conflicts response nextCursor");
  }
  return {
    conflicts: value["conflicts"].map(parseConflictRecord),
    nextCursor: (nextCursorRaw as string | null | undefined) ?? null,
  };
};

const parseResolveResponse = (value: unknown): SyncResolveConflictResponse => {
  if (!isRecord(value)) {
    throw new Error("Invalid sync resolve response");
  }
  if (typeof value["conflictId"] !== "string" || typeof value["resolutionEventId"] !== "string") {
    throw new Error("Invalid sync resolve response fields");
  }
  return {
    conflictId: value["conflictId"],
    resolutionEventId: value["resolutionEventId"],
  };
};

export const createConflictClient = (options?: ConflictClientOptions) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const listConflicts = async (status: "open" | "all" = "open"): Promise<SyncConflictsResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/sync/conflicts?status=${status}&limit=50`,
    });
    if (!response.ok) {
      throw new Error(`Sync conflicts failed with status ${String(response.status)}`);
    }
    return parseConflictsResponse(await apiClient.readJson<unknown>(response, "sync conflicts"));
  };

  const resolveConflict = async (
    conflictId: string,
    request: SyncResolveConflictRequest,
  ): Promise<SyncResolveConflictResponse> => {
    const response = await apiClient.request({
      method: "POST",
      path: `/sync/conflicts/${encodeURIComponent(conflictId)}/resolve`,
      body: request,
    });
    if (!response.ok) {
      throw new Error(`Resolve conflict failed with status ${String(response.status)}`);
    }
    return parseResolveResponse(await apiClient.readJson<unknown>(response, "resolve conflict"));
  };

  return {
    listConflicts,
    resolveConflict,
  };
};
