import type { Event } from "./events";

export type SyncCursor = string;

export type SyncPushRequest = {
  events: Event[];
  lastKnownCursor?: SyncCursor | null;
};

export type SyncPushAck = {
  eventId: string;
  status: "accepted" | "duplicate" | "rejected";
  reason?: string;
};

export type SyncPushResponse = {
  acknowledgements: SyncPushAck[];
  latestCursor: SyncCursor | null;
};

export type SyncPullResponse = {
  events: Event[];
  nextCursor: SyncCursor | null;
};

export type SyncStatusResponse = {
  latestCursor: SyncCursor | null;
  projectionRefreshedAt: string | null;
  projectionCursor: SyncCursor | null;
};

export type SyncConflictResolution = "accepted" | "rejected" | "merged";

export type SyncConflictRecord = {
  conflictId: string;
  detectedEventId: string;
  detectedAt: string;
  entityType:
    | "person"
    | "intake"
    | "sale"
    | "procurement"
    | "expense"
    | "inventory_batch"
    | "points_ledger";
  entityId: string;
  detectedEventIds: string[];
  summary: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolution: SyncConflictResolution | null;
  resolutionEventId: string | null;
  resolutionNotes: string | null;
  resolvedByUserId: string | null;
};

export type SyncConflictsResponse = {
  conflicts: SyncConflictRecord[];
  nextCursor: SyncCursor | null;
};

export type SyncResolveConflictRequest = {
  resolution: SyncConflictResolution;
  notes: string;
  resolvedEventId?: string | null;
  relatedEventIds?: string[] | null;
};

export type SyncResolveConflictResponse = {
  conflictId: string;
  resolutionEventId: string;
};

export type SyncAuditIssueCode =
  | "MISSING_DETECTED_EVENT_REFERENCE"
  | "ORPHAN_CONFLICT_RESOLUTION"
  | "MISSING_RESOLVED_EVENT_REFERENCE"
  | "MISSING_RELATED_EVENT_REFERENCE"
  | "DUPLICATE_CONFLICT_ID"
  | "DUPLICATE_CONFLICT_RESOLUTION"
  | "PROJECTION_CURSOR_MISSING_EVENT"
  | "PROJECTION_CURSOR_OUT_OF_RANGE";

export type SyncAuditIssue = {
  issueId: string;
  code: SyncAuditIssueCode;
  detectedAt: string;
  severity: "error" | "warning";
  detail: string;
  relatedEventIds: string[];
  conflictId?: string | null;
};

export type SyncAuditReportResponse = {
  generatedAt: string;
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  issues: SyncAuditIssue[];
  nextCursor: SyncCursor | null;
};

export type SyncAuditEventResponse = {
  event: Event;
  linkedConflictIds: string[];
  linkedResolutionEventIds: string[];
};

export type SyncReconciliationIssueCode =
  | "POINTS_BALANCE_MISMATCH"
  | "INVENTORY_STATUS_SUMMARY_MISMATCH"
  | "INVENTORY_BATCH_NEGATIVE_QUANTITY"
  | "PROJECTION_CURSOR_DRIFT";

export type SyncReconciliationIssueSeverity = "error" | "warning";

export type SyncReconciliationRepair =
  | {
      repairKind: "points_adjustment";
      deltaPoints: number;
      reasonTemplate: string;
    }
  | {
      repairKind: "inventory_adjustment";
      inventoryBatchId: string;
      fromStatus: "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
      toStatus: "storage" | "shop" | "sold" | "spoiled" | "damaged" | "missing";
      quantity: number;
      reasonTemplate: string;
    }
  | {
      repairKind: "projection_rebuild";
      reasonTemplate: string;
    };

export type SyncReconciliationIssue = {
  issueId: string;
  code: SyncReconciliationIssueCode;
  severity: SyncReconciliationIssueSeverity;
  entityType: "person" | "inventory_batch" | "inventory_status_summary" | "projection";
  entityId: string;
  detail: string;
  detectedAt: string;
  expected?: Record<string, number | string | null> | null;
  actual?: Record<string, number | string | null> | null;
  suggestedRepair?: SyncReconciliationRepair | null;
};

export type SyncReconciliationReportResponse = {
  generatedAt: string;
  summary: {
    totalIssues: number;
    errorCount: number;
    warningCount: number;
    repairableCount: number;
  };
  issues: SyncReconciliationIssue[];
  nextCursor: SyncCursor | null;
};

export type SyncRepairReconciliationIssueRequest = {
  notes: string;
};

export type SyncRepairReconciliationIssueResponse =
  | {
      issueId: string;
      repairKind: "points_adjustment" | "inventory_adjustment";
      repairEventId: string;
    }
  | {
      issueId: string;
      repairKind: "projection_rebuild";
      rebuiltAt: string;
    };
