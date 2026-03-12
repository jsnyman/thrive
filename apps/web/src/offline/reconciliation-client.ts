import type {
  SyncReconciliationIssue,
  SyncReconciliationIssueCode,
  SyncReconciliationReportResponse,
  SyncRepairReconciliationIssueResponse,
} from "../../../../packages/shared/src/domain/sync";
import { createApiClient } from "./api-client";

type JsonRecord = Record<string, unknown>;

type ReconciliationClientOptions = {
  fetchFn?: typeof fetch;
  baseUrl?: string;
};

type ReconciliationReportFilter = {
  limit?: number;
  cursor?: string | null;
  code?: SyncReconciliationIssueCode | null;
  repairableOnly?: boolean;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseRepair = (value: unknown): SyncReconciliationIssue["suggestedRepair"] => {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value) || typeof value["reasonTemplate"] !== "string") {
    throw new Error("Invalid reconciliation repair");
  }
  if (value["repairKind"] === "points_adjustment" && typeof value["deltaPoints"] === "number") {
    return {
      repairKind: "points_adjustment",
      deltaPoints: value["deltaPoints"],
      reasonTemplate: value["reasonTemplate"],
    };
  }
  if (
    value["repairKind"] === "inventory_adjustment" &&
    typeof value["inventoryBatchId"] === "string" &&
    typeof value["fromStatus"] === "string" &&
    typeof value["toStatus"] === "string" &&
    typeof value["quantity"] === "number"
  ) {
    return {
      repairKind: "inventory_adjustment",
      inventoryBatchId: value["inventoryBatchId"],
      fromStatus: value["fromStatus"] as SyncReconciliationIssue["suggestedRepair"] extends infer T
        ? T extends { repairKind: "inventory_adjustment"; fromStatus: infer U }
          ? U
          : never
        : never,
      toStatus: value["toStatus"] as SyncReconciliationIssue["suggestedRepair"] extends infer T
        ? T extends { repairKind: "inventory_adjustment"; toStatus: infer U }
          ? U
          : never
        : never,
      quantity: value["quantity"],
      reasonTemplate: value["reasonTemplate"],
    };
  }
  if (value["repairKind"] === "projection_rebuild") {
    return {
      repairKind: "projection_rebuild",
      reasonTemplate: value["reasonTemplate"],
    };
  }
  throw new Error("Invalid reconciliation repair");
};

const parseIssue = (value: unknown): SyncReconciliationIssue => {
  if (!isRecord(value)) {
    throw new Error("Invalid reconciliation issue");
  }
  if (
    typeof value["issueId"] !== "string" ||
    typeof value["code"] !== "string" ||
    typeof value["severity"] !== "string" ||
    typeof value["entityType"] !== "string" ||
    typeof value["entityId"] !== "string" ||
    typeof value["detail"] !== "string" ||
    typeof value["detectedAt"] !== "string"
  ) {
    throw new Error("Invalid reconciliation issue");
  }
  const expected = value["expected"];
  const actual = value["actual"];
  if (expected !== undefined && expected !== null && !isRecord(expected)) {
    throw new Error("Invalid reconciliation issue expected");
  }
  if (actual !== undefined && actual !== null && !isRecord(actual)) {
    throw new Error("Invalid reconciliation issue actual");
  }
  return {
    issueId: value["issueId"],
    code: value["code"] as SyncReconciliationIssueCode,
    severity: value["severity"] as SyncReconciliationIssue["severity"],
    entityType: value["entityType"] as SyncReconciliationIssue["entityType"],
    entityId: value["entityId"],
    detail: value["detail"],
    detectedAt: value["detectedAt"],
    expected: (expected as Record<string, number | string | null> | null | undefined) ?? null,
    actual: (actual as Record<string, number | string | null> | null | undefined) ?? null,
    suggestedRepair: parseRepair(value["suggestedRepair"]) ?? null,
  };
};

const parseReport = (value: unknown): SyncReconciliationReportResponse => {
  if (!isRecord(value) || !isRecord(value["summary"]) || !Array.isArray(value["issues"])) {
    throw new Error("Invalid reconciliation report");
  }
  const summary = value["summary"];
  if (
    typeof value["generatedAt"] !== "string" ||
    typeof summary["totalIssues"] !== "number" ||
    typeof summary["errorCount"] !== "number" ||
    typeof summary["warningCount"] !== "number" ||
    typeof summary["repairableCount"] !== "number"
  ) {
    throw new Error("Invalid reconciliation report");
  }
  const nextCursorRaw = value["nextCursor"];
  if (nextCursorRaw !== null && nextCursorRaw !== undefined && typeof nextCursorRaw !== "string") {
    throw new Error("Invalid reconciliation report");
  }
  return {
    generatedAt: value["generatedAt"],
    summary: {
      totalIssues: summary["totalIssues"],
      errorCount: summary["errorCount"],
      warningCount: summary["warningCount"],
      repairableCount: summary["repairableCount"],
    },
    issues: value["issues"].map(parseIssue),
    nextCursor: (nextCursorRaw as string | null | undefined) ?? null,
  };
};

const parseRepairResponse = (value: unknown): SyncRepairReconciliationIssueResponse => {
  if (
    !isRecord(value) ||
    typeof value["issueId"] !== "string" ||
    typeof value["repairKind"] !== "string"
  ) {
    throw new Error("Invalid reconciliation repair response");
  }
  if (
    (value["repairKind"] === "points_adjustment" ||
      value["repairKind"] === "inventory_adjustment") &&
    typeof value["repairEventId"] === "string"
  ) {
    return {
      issueId: value["issueId"],
      repairKind: value["repairKind"],
      repairEventId: value["repairEventId"],
    };
  }
  if (value["repairKind"] === "projection_rebuild" && typeof value["rebuiltAt"] === "string") {
    return {
      issueId: value["issueId"],
      repairKind: "projection_rebuild",
      rebuiltAt: value["rebuiltAt"],
    };
  }
  throw new Error("Invalid reconciliation repair response");
};

const toQueryString = (filters?: ReconciliationReportFilter): string => {
  const params = new URLSearchParams();
  if (filters?.limit !== undefined) {
    params.set("limit", String(filters.limit));
  }
  if (filters?.cursor !== undefined && filters.cursor !== null && filters.cursor.length > 0) {
    params.set("cursor", filters.cursor);
  }
  if (filters?.code !== undefined && filters.code !== null) {
    params.set("code", filters.code);
  }
  if (filters?.repairableOnly !== undefined) {
    params.set("repairableOnly", filters.repairableOnly ? "true" : "false");
  }
  const query = params.toString();
  return query.length === 0 ? "" : `?${query}`;
};

export const createReconciliationClient = (options?: ReconciliationClientOptions) => {
  const apiClient = createApiClient({
    ...(options?.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    ...(options?.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
  });

  const getReport = async (
    filters?: ReconciliationReportFilter,
  ): Promise<SyncReconciliationReportResponse> => {
    const response = await apiClient.request({
      method: "GET",
      path: `/sync/reconciliation/report${toQueryString(filters)}`,
    });
    if (!response.ok) {
      throw new Error(`Reconciliation report failed with status ${String(response.status)}`);
    }
    return parseReport(await apiClient.readJson<unknown>(response, "reconciliation report"));
  };

  const repairIssue = async (
    issueId: string,
    notes: string,
  ): Promise<SyncRepairReconciliationIssueResponse> => {
    const response = await apiClient.request({
      method: "POST",
      path: `/sync/reconciliation/issues/${encodeURIComponent(issueId)}/repair`,
      body: { notes },
    });
    if (!response.ok) {
      throw new Error(`Reconciliation repair failed with status ${String(response.status)}`);
    }
    return parseRepairResponse(
      await apiClient.readJson<unknown>(response, "reconciliation repair"),
    );
  };

  return {
    getReport,
    repairIssue,
  };
};

export type { ReconciliationReportFilter };
