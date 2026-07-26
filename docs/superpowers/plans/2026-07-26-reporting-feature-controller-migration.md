# Reporting Feature Controller Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish typed in-app navigation and an authenticated shell, then extract Reporting and Reconciliation from `App` into the first session-scoped feature controller without changing visible behavior.

**Architecture:** `App` keeps authentication and legacy workflows during this first vertical slice. A typed navigation module and presentational `AuthenticatedShell` establish the application boundary. A render-prop `ReportingSessionProvider` owns all report and reconciliation state for the lifetime of the authenticated tree while only the selected reporting screen is rendered.

**Tech Stack:** React 18, TypeScript 5, Mantine 7, Vitest 4, Testing Library, functional HTTP clients.

## Global Constraints

- Follow ADR 0005 in `docs/architecture/decisions/0005-feature-controllers-with-session-scoped-state.md`.
- Keep in-app view-state navigation; do not add a client-side router.
- A login or refresh starts at Person Search.
- Preserve reporting drafts, filters, results, selections, errors, and panel state while navigating within the authenticated session.
- Logout, refresh, or restart destroys feature-controller state.
- A successful reconciliation repair clears only the completed repair draft; validation, authorization, sync, and network failures preserve it.
- Render only the active screen. Do not keep inactive screens mounted or hidden.
- Keep API authorization authoritative; UI visibility is not a security boundary.
- Do not add class-based services, global mutable state, default exports, `any`, or implicit returns.
- Reuse domain types and validation from `packages/shared/src/domain`.
- Write or preserve tests before moving behavior, and keep coverage at or above the current thresholds.
- Keep this plan limited to the shell/navigation foundation and Reporting/Reconciliation. Create later plans for the remaining ADR feature modules.

---

## File Structure

Create:

- `apps/web/src/app/navigation.ts` — view keys, view titles, and role-based view access.
- `apps/web/src/app/navigation.spec.ts` — pure navigation contract tests.
- `apps/web/src/app/AuthenticatedShell.tsx` — authenticated layout, navigation, sync header, and active-view heading.
- `apps/web/src/app/AuthenticatedShell.spec.tsx` — shell rendering, role visibility, and navigation tests.
- `apps/web/src/features/reporting/reporting-state.ts` — report keys, labels, state, actions, and pure reducer.
- `apps/web/src/features/reporting/reporting-state.spec.ts` — reducer and state-lifecycle tests.
- `apps/web/src/features/reporting/reporting-controller.tsx` — session provider, clients, stale-request guards, intent-level actions.
- `apps/web/src/features/reporting/reporting-controller.spec.tsx` — controller behavior with injected clients.
- `apps/web/src/features/reporting/report-export.ts` — report-to-CSV row mapping.
- `apps/web/src/features/reporting/report-export.spec.ts` — export mapping tests.
- `apps/web/src/features/reporting/ReportingFeature.tsx` — report landing and active-panel switch.
- `apps/web/src/features/reporting/ReportingFeature.spec.tsx` — feature composition and inactive-screen tests.
- `apps/web/src/features/reporting/screens/ReconciliationScreen.tsx`
- `apps/web/src/features/reporting/screens/MaterialsCollectedReportScreen.tsx`
- `apps/web/src/features/reporting/screens/PointsLiabilityReportScreen.tsx`
- `apps/web/src/features/reporting/screens/InventoryStatusReportScreen.tsx`
- `apps/web/src/features/reporting/screens/InventoryStatusLogReportScreen.tsx`
- `apps/web/src/features/reporting/screens/SalesReportScreen.tsx`
- `apps/web/src/features/reporting/screens/CashflowReportScreen.tsx`

Modify:

- `apps/web/src/App.tsx` — compose the shell/provider, pass shared reference data, and remove extracted state, effects, handlers, helpers, and JSX.
- `apps/web/src/App.spec.tsx` — add lifecycle characterization tests and retain end-to-end component integration coverage.

Do not modify the existing HTTP clients in `apps/web/src/offline/`; the feature controller consumes their current interfaces.

---

### Task 1: Lock Reporting Session Behavior with Characterization Tests

**Files:**

- Modify: `apps/web/src/App.spec.tsx:4044-6010`

**Interfaces:**

- Consumes: the current `App` behavior and existing `openManagerPanel(view, buttonName)` test helper.
- Produces: regression tests that must pass before and after extraction.

- [ ] **Step 1: Add a test proving report state survives navigation**

Add an administrator test beside the current reporting tests. Use the same complete fetch responses already used by `"materials report filtered run sends query"`, then exercise this exact behavior:

```tsx
await userEvent.click(view.getByRole("button", { name: "Reports" }));
await userEvent.click(view.getByRole("button", { name: "Materials Collected Report" }));
await openManagerPanel(view, "Open Materials Collected Report");
await userEvent.type(view.getByLabelText("From Date"), "2026-03-01");
await userEvent.selectOptions(view.getByLabelText("Collection Point"), "cp-1");

await userEvent.click(view.getByRole("button", { name: "Search" }));
expect(view.queryByRole("heading", { name: "Materials Collected Report" })).not.toBeInTheDocument();

await userEvent.click(view.getByRole("button", { name: "Reports" }));
await userEvent.click(view.getByRole("button", { name: "Materials Collected Report" }));

expect(view.getByLabelText("From Date")).toHaveValue("2026-03-01");
expect(view.getByLabelText("Collection Point")).toHaveValue("cp-1");
```

Name the test `"report draft survives navigation during the authenticated session"`.

- [ ] **Step 2: Add a test proving a network failure preserves the draft**

Return status 503 from `/reports/materials-collected`, run the report, and assert both the error and original fields remain:

```tsx
await userEvent.type(view.getByLabelText("From Date"), "2026-03-01");
await userEvent.type(view.getByLabelText("To Date"), "2026-03-09");
await userEvent.click(view.getByRole("button", { name: "Run Report" }));

await waitFor(() => {
  expect(view.getByText("Materials report fetch failed with status 503")).toBeInTheDocument();
});
expect(view.getByLabelText("From Date")).toHaveValue("2026-03-01");
expect(view.getByLabelText("To Date")).toHaveValue("2026-03-09");
```

Name the test `"report network failure preserves entered filters"`.

- [ ] **Step 3: Add a test proving logout destroys the reporting session**

Enter a materials date filter, click Logout, sign in again, navigate back to the materials report, open it, and assert:

```tsx
expect(view.getByLabelText("From Date")).toHaveValue("");
expect(view.getByLabelText("To Date")).toHaveValue("");
```

Name the test `"logout destroys preserved report drafts"`.

- [ ] **Step 4: Run the characterization tests**

Run:

```bash
npm run test:web -- apps/web/src/App.spec.tsx -t "report draft survives|report network failure|logout destroys"
```

Expected: all three tests pass against the current component. If a test exposes an existing defect, keep the test and record the failure before continuing; do not weaken the approved lifecycle.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.spec.tsx
git commit -m "test(web): characterize reporting session lifecycle"
```

---

### Task 2: Introduce Typed Navigation and Access Rules

**Files:**

- Create: `apps/web/src/app/navigation.ts`
- Create: `apps/web/src/app/navigation.spec.ts`
- Modify: `apps/web/src/App.tsx:166-184,893,3523-3542`

**Interfaces:**

- Consumes: `AuthUser["role"]` from `apps/web/src/offline/auth-client.ts`.
- Produces:
  - `NavViewKey`
  - `initialNavView: "person-search"`
  - `canAccessView(role: AuthUser["role"], view: NavViewKey): boolean`
  - `getViewTitle(view: NavViewKey): string`

- [ ] **Step 1: Write failing navigation tests**

```ts
import { describe, expect, test } from "vitest";
import { canAccessView, getViewTitle, initialNavView } from "./navigation";

describe("navigation", () => {
  test("starts every authenticated session at person search", () => {
    expect(initialNavView).toBe("person-search");
  });

  test("blocks administrator-only views for a normal user", () => {
    expect(canAccessView("user", "reporting")).toBe(false);
    expect(canAccessView("user", "shop-procurement")).toBe(false);
    expect(canAccessView("user", "users-list")).toBe(false);
    expect(canAccessView("user", "shop-sale")).toBe(true);
  });

  test("labels all reporting views through the Reports section", () => {
    expect(getViewTitle("reporting")).toBe("Reports");
    expect(getViewTitle("person-search")).toBe("Person Registry");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:web -- apps/web/src/app/navigation.spec.ts
```

Expected: FAIL because `navigation.ts` does not exist.

- [ ] **Step 3: Implement the navigation contract**

Create the exact `NavViewKey` union currently declared in `App.tsx`. Define administrator-only views as a readonly set:

```ts
import type { AuthUser } from "../offline/auth-client";

export type NavViewKey =
  | "person-search"
  | "person-create"
  | "person-edit"
  | "collection-log"
  | "shop-sale"
  | "shop-procurement"
  | "shop-expense"
  | "adjustments"
  | "adjustments-points-request"
  | "adjustments-inventory-request"
  | "adjustments-points-apply"
  | "adjustments-inventory-apply"
  | "reporting"
  | "users-list"
  | "items-manage"
  | "collection-points-manage"
  | "materials-manage";

export const initialNavView: NavViewKey = "person-search";

const administratorViews: ReadonlySet<NavViewKey> = new Set([
  "shop-procurement",
  "shop-expense",
  "adjustments-points-apply",
  "adjustments-inventory-apply",
  "reporting",
  "users-list",
  "items-manage",
  "collection-points-manage",
  "materials-manage",
]);

export const canAccessView = (role: AuthUser["role"], view: NavViewKey): boolean =>
  role === "administrator" || !administratorViews.has(view);
```

Implement `getViewTitle` with this exhaustive grouping:

```ts
export const getViewTitle = (view: NavViewKey): string => {
  switch (view) {
    case "collection-log":
      return "Collection";
    case "shop-sale":
      return "Sales";
    case "shop-procurement":
    case "shop-expense":
      return "Administration";
    case "items-manage":
      return "Manage Items";
    case "collection-points-manage":
      return "Collection Points";
    case "materials-manage":
      return "Collected Materials";
    case "adjustments":
    case "adjustments-points-request":
    case "adjustments-inventory-request":
    case "adjustments-points-apply":
    case "adjustments-inventory-apply":
      return "Adjustments";
    case "reporting":
      return "Reports";
    case "users-list":
      return "User Management";
    case "person-search":
    case "person-create":
    case "person-edit":
      return "Person Registry";
  }
};
```

- [ ] **Step 4: Replace local navigation types and title branching**

Import `NavViewKey`, `getViewTitle`, and `initialNavView` into `App.tsx`. Remove its local `NavViewKey`, initialize `activeView` with `initialNavView`, and replace the nested heading ternary with:

```tsx
<Title order={2}>{getViewTitle(activeView)}</Title>
```

- [ ] **Step 5: Run focused and full App tests**

```bash
npm run test:web -- apps/web/src/app/navigation.spec.ts apps/web/src/App.spec.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/navigation.ts apps/web/src/app/navigation.spec.ts apps/web/src/App.tsx
git commit -m "refactor(web): add typed navigation contract"
```

---

### Task 3: Extract the Authenticated Application Shell

**Files:**

- Create: `apps/web/src/app/AuthenticatedShell.tsx`
- Create: `apps/web/src/app/AuthenticatedShell.spec.tsx`
- Modify: `apps/web/src/App.tsx:3314-3573,6677-6678`

**Interfaces:**

- Consumes:
  - `NavViewKey`, `canAccessView`, and `getViewTitle` from Task 2.
  - `AuthUser` and `SyncViewModel`.
- Produces:

```ts
export type AuthenticatedShellProps = {
  user: AuthUser;
  activeView: NavViewKey;
  pendingAdjustmentCount: number;
  collectionPointPromptLoading: boolean;
  collectionPointPromptError: string | null;
  sessionCollectionPointName: string | null;
  sync: Pick<SyncViewModel, "status" | "pendingCount" | "lastSyncAt" | "errorMessage">;
  syncAvailable: boolean;
  deferredSyncNotice: string | null;
  materialsError: string | null;
  itemsError: string | null;
  startupWarnings: string[];
  onNavigate: (view: NavViewKey) => void;
  onEnterSection: (section: "collection" | "sales") => void;
  onExitSection: () => void;
  onSync: () => void;
  onLogout: () => void;
  children: ReactNode;
};
```

- [ ] **Step 1: Write failing shell tests**

Render the shell with an administrator and a normal user. Assert:

```tsx
expect(adminView.getByRole("button", { name: "Reports" })).toBeInTheDocument();
expect(userView.queryByRole("button", { name: "Reports" })).not.toBeInTheDocument();
expect(userView.getByRole("button", { name: "Record Sale" })).toBeInTheDocument();
expect(userView.getByRole("heading", { name: "Person Registry" })).toBeInTheDocument();
```

Click Reports for the administrator and assert `onNavigate` receives `"reporting"`. Render with `activeView="reporting"` and assert only the supplied `children` content is rendered in the main slot; the shell must not own a reporting screen.

- [ ] **Step 2: Run the shell tests and verify they fail**

```bash
npm run test:web -- apps/web/src/app/AuthenticatedShell.spec.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Move the layout into `AuthenticatedShell`**

Move the current authenticated `AppShell`, Navbar, Header, title, session location, sync summary, warnings, and error summary from `App.tsx`. Keep navigation side effects outside:

```tsx
<Button
  className="navActionButton"
  variant={activeView === "reporting" ? "filled" : "light"}
  onClick={() => {
    onNavigate("reporting");
  }}
>
  Reports
</Button>
```

Use `canAccessView(user.role, view)` for administrator-only navigation groups. Call `onEnterSection` for collection and sales because those flows require collection-point selection.

- [ ] **Step 4: Centralize legacy navigation side effects in `App`**

Add one temporary adapter in `App.tsx`:

```ts
const handleNavigate = (view: NavViewKey): void => {
  if (sessionUser === null || !canAccessView(sessionUser.role, view)) {
    return;
  }
  if (view === "person-create") {
    resetCreatePersonDraft();
  } else if (view === "shop-procurement") {
    void loadProcurements();
  } else if (view === "collection-points-manage") {
    void loadCollectionPoints();
  } else if (view === "materials-manage") {
    void loadMaterials();
  } else if (view === "users-list") {
    setUsersCreateMode(false);
    setEditUserId(null);
  }
  setActiveView(view);
};
```

Extract the existing create-person field clears into `resetCreatePersonDraft(): void`; do not change when those fields reset in this task.

- [ ] **Step 5: Compose the shell from `App`**

```tsx
<AuthenticatedShell
  user={sessionUser}
  activeView={activeView}
  pendingAdjustmentCount={pendingAdjustmentCount}
  collectionPointPromptLoading={collectionPointPromptLoading}
  collectionPointPromptError={collectionPointPromptError}
  sessionCollectionPointName={sessionCollectionPointName}
  sync={sync}
  syncAvailable={queue !== null && syncStateStore !== null}
  deferredSyncNotice={deferredSyncNotice}
  materialsError={materialsError}
  itemsError={itemsError}
  startupWarnings={startupWarnings}
  onNavigate={handleNavigate}
  onEnterSection={(section) => {
    void enterSection(section);
  }}
  onExitSection={exitSection}
  onSync={() => {
    void sync.syncNow().then(() => loadAllPeople());
  }}
  onLogout={handleLogout}
>
  {/* Existing workflow render branches remain here for now. */}
</AuthenticatedShell>
```

- [ ] **Step 6: Run shell and App tests**

```bash
npm run test:web -- apps/web/src/app/AuthenticatedShell.spec.tsx apps/web/src/App.spec.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/AuthenticatedShell.tsx apps/web/src/app/AuthenticatedShell.spec.tsx apps/web/src/App.tsx
git commit -m "refactor(web): extract authenticated application shell"
```

---

### Task 4: Define the Reporting State Machine

**Files:**

- Create: `apps/web/src/features/reporting/reporting-state.ts`
- Create: `apps/web/src/features/reporting/reporting-state.spec.ts`

**Interfaces:**

- Consumes report response and filter types from `offline/reports-client.ts`, `InventoryStatus`, and reconciliation types from `packages/shared/src/domain/sync`.
- Produces:
  - `ReportPanelKey`
  - `REPORT_PANEL_LABELS`
  - `MaterialsReportDraft`
  - `PointsLiabilityDraft`
  - `InventoryStatusLogDraft`
  - `SalesReportDraft`
  - `CashflowReportDraft`
  - `ReportingState`
  - `ReportingAction`
  - `createInitialReportingState()`
  - `reportingReducer(state, action)`

- [ ] **Step 1: Write failing state-lifecycle tests**

Cover:

```ts
const initial = createInitialReportingState();
const edited = reportingReducer(initial, {
  type: "materialsDraftChanged",
  patch: { fromDate: "2026-03-01", collectionPointId: "cp-1" },
});
const navigated = reportingReducer(edited, { type: "landingOpened" });

expect(navigated.materials.draft.fromDate).toBe("2026-03-01");
expect(navigated.materials.draft.collectionPointId).toBe("cp-1");
expect(navigated.activePanel).toBeNull();
```

Also test that:

- `panelSelected` changes only `activePanel`;
- `panelToggled` records `open` and `loaded` independently per panel;
- `requestFailed` preserves the matching draft and prior data;
- `reconciliationRepairFailed` preserves `selectedIssueId` and `repairNotes`;
- `reconciliationRepairSucceeded` clears only those two repair fields;
- a fresh `createInitialReportingState()` has blank drafts and no active/open panel.

- [ ] **Step 2: Run the reducer tests and verify they fail**

```bash
npm run test:web -- apps/web/src/features/reporting/reporting-state.spec.ts
```

Expected: FAIL because `reporting-state.ts` does not exist.

- [ ] **Step 3: Implement explicit nested state**

Use this operation state rather than unrelated loading/error booleans:

```ts
export type OperationState =
  | { status: "idle"; error: null }
  | { status: "loading"; error: null }
  | { status: "succeeded"; error: null }
  | { status: "failed"; error: string };

export type ReportPanelKey =
  | "reconciliation"
  | "materialsReport"
  | "pointsLiability"
  | "inventoryStatusReport"
  | "inventoryStatusLog"
  | "salesReport"
  | "cashflowReport";

export type PanelSession = {
  open: boolean;
  loaded: boolean;
};

export type MaterialsReportDraft = {
  fromDate: string;
  toDate: string;
  collectionPointId: string | null;
  materialTypeId: string | null;
};

export type PointsLiabilityDraft = { search: string };

export type InventoryStatusLogDraft = {
  fromDate: string;
  toDate: string;
  fromStatus: InventoryStatus | null;
  toStatus: InventoryStatus | null;
};

export type SalesReportDraft = {
  fromDate: string;
  toDate: string;
  collectionPointId: string | null;
  itemId: string | null;
};

export type CashflowReportDraft = {
  fromDate: string;
  toDate: string;
  collectionPointId: string | null;
};

type ReportSession<Draft, Response> = {
  draft: Draft;
  response: Response | null;
  operation: OperationState;
};

export type ReportingState = {
  activePanel: ReportPanelKey | null;
  panels: Record<ReportPanelKey, PanelSession>;
  materials: ReportSession<MaterialsReportDraft, MaterialsCollectedReportResponse>;
  pointsLiability: ReportSession<PointsLiabilityDraft, PointsLiabilityReportResponse>;
  inventoryStatus: {
    response: InventoryStatusReportResponse | null;
    operation: OperationState;
  };
  inventoryStatusLog: ReportSession<InventoryStatusLogDraft, InventoryStatusLogReportResponse>;
  sales: ReportSession<SalesReportDraft, SalesReportResponse>;
  cashflow: ReportSession<CashflowReportDraft, CashflowReportResponse>;
  reconciliation: {
    summary: SyncReconciliationReportResponse["summary"] | null;
    issues: SyncReconciliationIssue[];
    nextCursor: string | null;
    loadOperation: OperationState;
    loadMoreOperation: OperationState;
    selectedIssueId: string | null;
    repairNotes: string;
    repairOperation: OperationState;
  };
};
```

Initialize all strings to `""`, nullable selections/responses to `null`, arrays to `[]`, panel flags to `false`, and operations to `{ status: "idle", error: null }`.

Use a discriminated `ReportingAction` union containing:

- `landingOpened`, `panelSelected`, and `panelToggled`;
- one `*DraftChanged` action for each exported draft type;
- `requestStarted` and `requestFailed`, keyed by `ReportPanelKey`;
- response-typed `materialsRequestSucceeded`, `pointsLiabilityRequestSucceeded`, `inventoryStatusRequestSucceeded`, `inventoryStatusLogRequestSucceeded`, `salesRequestSucceeded`, and `cashflowRequestSucceeded`;
- `reconciliationLoadStarted`, `reconciliationLoadSucceeded`, and `reconciliationLoadFailed`, each carrying `append` where applicable;
- `reconciliationIssueSelected`, `reconciliationRepairNotesChanged`, `reconciliationRepairStarted`, `reconciliationRepairFailed`, and `reconciliationRepairSucceeded`.

Do not add a generic `payload: unknown` action. A success action carries its exact response type.

- [ ] **Step 4: Run reducer tests**

```bash
npm run test:web -- apps/web/src/features/reporting/reporting-state.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/reporting/reporting-state.ts apps/web/src/features/reporting/reporting-state.spec.ts
git commit -m "feat(web): add reporting session state machine"
```

---

### Task 5: Implement the Session-Scoped Reporting Controller

**Files:**

- Create: `apps/web/src/features/reporting/reporting-controller.tsx`
- Create: `apps/web/src/features/reporting/reporting-controller.spec.tsx`

**Interfaces:**

- Consumes:
  - `ReturnType<typeof createReportsClient>`
  - `ReturnType<typeof createReconciliationClient>`
  - `ReportingState` and `reportingReducer`
  - `syncNow: () => Promise<unknown>`
- Produces:

```ts
export type ReportingController = {
  state: ReportingState;
  openLanding: () => void;
  selectPanel: (panel: ReportPanelKey) => void;
  togglePanel: (panel: ReportPanelKey) => Promise<void>;
  updateMaterialsDraft: (patch: Partial<MaterialsReportDraft>) => void;
  updatePointsLiabilityDraft: (patch: Partial<PointsLiabilityDraft>) => void;
  updateInventoryStatusLogDraft: (patch: Partial<InventoryStatusLogDraft>) => void;
  updateSalesDraft: (patch: Partial<SalesReportDraft>) => void;
  updateCashflowDraft: (patch: Partial<CashflowReportDraft>) => void;
  runMaterialsReport: () => Promise<void>;
  runPointsLiabilityReport: () => Promise<void>;
  runInventoryStatusReport: () => Promise<void>;
  runInventoryStatusLogReport: () => Promise<void>;
  runSalesReport: () => Promise<void>;
  runCashflowReport: () => Promise<void>;
  refreshReconciliation: () => Promise<void>;
  loadMoreReconciliation: () => Promise<void>;
  selectReconciliationIssue: (issueId: string) => void;
  updateRepairNotes: (notes: string) => void;
  repairSelectedIssue: () => Promise<void>;
};
```

- [ ] **Step 1: Write failing controller tests with injected clients**

Test through a small harness that captures the render-prop controller:

```tsx
<ReportingSessionProvider
  canViewReports
  reportsClient={reportsClient}
  reconciliationClient={reconciliationClient}
  syncNow={syncNow}
>
  {(controller) => <ControllerProbe controller={controller} />}
</ReportingSessionProvider>
```

Cover:

- opening a panel loads it once and reopening does not refetch;
- an explicit run uses trimmed draft filters;
- a rejected report request preserves the draft and stores the error;
- when two requests resolve out of order, only the newest response is applied;
- unmounting the provider before a request resolves does not apply its response;
- permission denial does not call either client;
- load-more appends reconciliation issues;
- empty repair notes do not call `repairIssue`;
- failed repair preserves selection and notes;
- successful repair refreshes reconciliation, calls `syncNow`, and clears only the repair draft.

- [ ] **Step 2: Run controller tests and verify they fail**

```bash
npm run test:web -- apps/web/src/features/reporting/reporting-controller.spec.tsx
```

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement dependency injection and session lifetime**

```tsx
export type ReportingSessionProviderProps = {
  canViewReports: boolean;
  reportsClient?: ReturnType<typeof createReportsClient>;
  reconciliationClient?: ReturnType<typeof createReconciliationClient>;
  syncNow: () => Promise<unknown>;
  children: (controller: ReportingController) => ReactNode;
};

export const ReportingSessionProvider = ({
  canViewReports,
  reportsClient: injectedReportsClient,
  reconciliationClient: injectedReconciliationClient,
  syncNow,
  children,
}: ReportingSessionProviderProps): JSX.Element => {
  const reportsClient = useMemo(
    () => injectedReportsClient ?? createReportsClient(),
    [injectedReportsClient],
  );
  const reconciliationClient = useMemo(
    () => injectedReconciliationClient ?? createReconciliationClient(),
    [injectedReconciliationClient],
  );
  const [state, dispatch] = useReducer(reportingReducer, undefined, createInitialReportingState);
  // Intent-level callbacks follow.
  return <>{children(controller)}</>;
};
```

Keep a request counter per endpoint in `useRef<Record<ReportPanelKey, number>>`. Increment before each request and dispatch success/failure only when the counter still matches. In an unmount cleanup, mark the provider inactive and increment every counter so late responses are ignored. Preserve the current lazy-load behavior: selecting a report does not fetch; the first transition from closed to open fetches; reopening an already loaded panel does not fetch.

- [ ] **Step 4: Implement permission and failure semantics**

Every network action starts with the same explicit guard:

```ts
if (!canViewReports) {
  dispatch({
    type: "requestFailed",
    panel: "materialsReport",
    error: "You do not have permission to view reports",
  });
  return;
}
```

Use the current user-facing error messages for report and reconciliation actions. Do not clear draft fields in `catch` or `finally`.

- [ ] **Step 5: Run controller and reducer tests**

```bash
npm run test:web -- apps/web/src/features/reporting/reporting-controller.spec.tsx apps/web/src/features/reporting/reporting-state.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/reporting/reporting-controller.tsx apps/web/src/features/reporting/reporting-controller.spec.tsx
git commit -m "feat(web): add session-scoped reporting controller"
```

---

### Task 6: Extract CSV Mapping and Reporting Screens

**Files:**

- Create: `apps/web/src/features/reporting/report-export.ts`
- Create: `apps/web/src/features/reporting/report-export.spec.ts`
- Create: `apps/web/src/features/reporting/ReportingFeature.tsx`
- Create: `apps/web/src/features/reporting/ReportingFeature.spec.tsx`
- Create: all seven files under `apps/web/src/features/reporting/screens/`
- Modify later in Task 7: `apps/web/src/App.tsx:200-308,4609-5497`

**Interfaces:**

- Consumes:
  - `ReportingController`
  - `MaterialRecord[]`, `ItemRecord[]`, and `CollectionPointRecord[]`
  - `downloadCsv`
- Produces:

```ts
export type ReportingFeatureProps = {
  controller: ReportingController;
  materials: MaterialRecord[];
  items: ItemRecord[];
  collectionPoints: CollectionPointRecord[];
};
```

- [ ] **Step 1: Write failing CSV mapping tests**

Move the five current `build*ExportRows` contracts out of `App`. Test at least:

```ts
expect(
  buildCashflowExportRows(
    [
      {
        day: "2026-03-01",
        salesPointsValue: 10,
        expenseCashTotal: 4,
        netCashflow: 6,
        saleCount: 1,
        expenseCount: 1,
      },
    ],
    [{ category: "fuel", totalCashAmount: 4, expenseCount: 1 }],
  ),
).toEqual([
  {
    section: "daily",
    day: "2026-03-01",
    salesPointsValue: 10,
    expenseCashTotal: 4,
    netCashflow: 6,
    saleCount: 1,
    expenseCount: 1,
  },
  {
    section: "expense_category",
    category: "fuel",
    totalCashAmount: 4,
    expenseCount: 1,
  },
]);
```

Add equivalent focused assertions for materials, points liability, inventory status, inventory log, and sales mappings.

- [ ] **Step 2: Run export tests and verify they fail**

```bash
npm run test:web -- apps/web/src/features/reporting/report-export.spec.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Move the pure export mappers**

Copy `buildMaterialsReportExportRows`, `buildPointsLiabilityExportRows`, `buildInventoryStatusExportRows`, `buildInventoryStatusLogExportRows`, `buildSalesReportExportRows`, and `buildCashflowExportRows` from `App.tsx` into `report-export.ts` as named exports. Preserve their current output exactly.

- [ ] **Step 4: Write failing feature composition tests**

With a typed controller fixture:

```tsx
const view = render(
  <MantineProvider>
    <ReportingFeature controller={controller} materials={[]} items={[]} collectionPoints={[]} />
  </MantineProvider>,
);
```

Assert:

- `activePanel === null` renders the seven landing buttons;
- selecting one panel renders only its matching heading;
- a closed panel renders its Open button but no filter controls;
- opening materials shows its draft values;
- a materials controller error remains visible with the draft;
- reconciliation renders repair confirmation only for the selected repairable issue;
- no component performs a network request during render.

- [ ] **Step 5: Run feature tests and verify they fail**

```bash
npm run test:web -- apps/web/src/features/reporting/ReportingFeature.spec.tsx
```

Expected: FAIL because `ReportingFeature` does not exist.

- [ ] **Step 6: Extract the landing and panel switch**

```tsx
export const ReportingFeature = ({
  controller,
  materials,
  items,
  collectionPoints,
}: ReportingFeatureProps): JSX.Element => {
  const panel = controller.state.activePanel;
  if (panel === null) {
    return <ReportingLanding onSelect={controller.selectPanel} />;
  }
  switch (panel) {
    case "reconciliation":
      return <ReconciliationScreen controller={controller} />;
    case "materialsReport":
      return (
        <MaterialsCollectedReportScreen
          controller={controller}
          materials={materials}
          collectionPoints={collectionPoints}
        />
      );
    case "pointsLiability":
      return <PointsLiabilityReportScreen controller={controller} />;
    case "inventoryStatusReport":
      return <InventoryStatusReportScreen controller={controller} />;
    case "inventoryStatusLog":
      return <InventoryStatusLogReportScreen controller={controller} />;
    case "salesReport":
      return (
        <SalesReportScreen
          controller={controller}
          items={items}
          collectionPoints={collectionPoints}
        />
      );
    case "cashflowReport":
      return <CashflowReportScreen controller={controller} collectionPoints={collectionPoints} />;
  }
};
```

- [ ] **Step 7: Move each existing JSX branch without redesign**

Move the current branches at `App.tsx:4609-5497` into their matching screen files. Replace raw setters and handlers with controller intent actions. Keep all labels, headings, empty states, responsive grids, button text, CSV filenames, and formatting unchanged. A panel reads only its matching nested controller state.

For example:

```tsx
<TextInput
  label="From Date"
  placeholder="YYYY-MM-DD"
  value={state.materials.draft.fromDate}
  onChange={(event) => {
    controller.updateMaterialsDraft({ fromDate: event.currentTarget.value });
  }}
/>
```

Use `void controller.runMaterialsReport()` and `void controller.togglePanel("materialsReport")` in click handlers.

- [ ] **Step 8: Run feature and export tests**

```bash
npm run test:web -- apps/web/src/features/reporting/ReportingFeature.spec.tsx apps/web/src/features/reporting/report-export.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/reporting
git commit -m "refactor(web): extract reporting screens"
```

---

### Task 7: Integrate the Reporting Session and Remove Root Ownership

**Files:**

- Modify: `apps/web/src/App.tsx:59-71,157-213,612-613,758-868,1021-1028,1419-1668,1719-1725,2888-3027,3461-3465,4609-5497`
- Modify: `apps/web/src/App.spec.tsx:4044-6010`

**Interfaces:**

- Consumes:
  - `AuthenticatedShell`
  - `ReportingSessionProvider`
  - `ReportingFeature`
- Produces: `App` with no Reporting/Reconciliation draft state, API orchestration, panel state, or render branches.

- [ ] **Step 1: Run the characterization suite before integration**

```bash
npm run test:web -- apps/web/src/App.spec.tsx -t "report|Report|reconciliation|Reconciliation|logout"
```

Expected: PASS. These tests are the behavior-preserving gate for the refactor.

- [ ] **Step 2: Wrap the authenticated shell in the reporting provider**

Create the provider only in the authenticated return so logout unmounts it:

```tsx
<ReportingSessionProvider canViewReports={canViewReports} syncNow={sync.syncNow}>
  {(reportingController) => (
    <AuthenticatedShell
      {...shellProps}
      onNavigate={(view) => {
        if (view === "reporting") {
          reportingController.openLanding();
        }
        handleNavigate(view);
      }}
    >
      {activeView === "reporting" ? (
        <ReportingFeature
          controller={reportingController}
          materials={materials}
          items={items}
          collectionPoints={collectionPoints}
        />
      ) : null}
      {/* Keep each existing non-report workflow branch below this slot,
          guarded by its existing activeView condition. */}
    </AuthenticatedShell>
  )}
</ReportingSessionProvider>
```

Do not create a module-level provider or store. Ensure the provider remains at the same tree position while `activeView` changes.

- [ ] **Step 3: Remove extracted root code**

Delete from `App.tsx`:

- report/reconciliation client creation;
- `ManagerPanelKey`, panel labels, open/loaded maps, and active report panel;
- all report/reconciliation state and request refs;
- selected reconciliation issue memo;
- report loading, panel toggling, run, pagination, and repair handlers;
- the report reset effect;
- report CSV mapping helpers;
- report/reconciliation JSX branches;
- imports made unused by those deletions.

Keep shared reference-data loaders and arrays in `App` for this slice because other legacy workflows still consume them.

- [ ] **Step 4: Run the boundary and targeted behavior tests**

```bash
npm run test:web -- apps/web/src/features/reporting apps/web/src/App.spec.tsx -t "report|Report|reconciliation|Reconciliation|logout"
rg -n "createReportsClient|createReconciliationClient|const \\[materialsReport|const \\[reconciliationIssues|loadMaterialsCollectedReport|handleRepairReconciliationIssue" apps/web/src/App.tsx
```

Expected: all tests pass, including all pre-existing reporting tests, and `rg` returns no matches.

- [ ] **Step 5: Run the complete web verification**

```bash
npm run test:web
npm run test:web:coverage
npm run typecheck
npm run lint
npm run format
```

Expected: all commands pass and coverage remains at least 75% statements, 60% branches, 75% functions, and 75% lines.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/App.spec.tsx apps/web/src/app apps/web/src/features/reporting
git commit -m "refactor(web): move reporting behind feature controller"
```

---

### Task 8: Validate the Architecture Slice and Refresh Graphify

**Files:**

- Modify generated graph artifacts under `graphify-out/` through the Graphify CLI only.
- Do not modify ADR 0005 unless implementation reveals a decision contradiction.

**Interfaces:**

- Consumes: all prior tasks.
- Produces: verified first migration slice and a current local knowledge graph.

- [ ] **Step 1: Query the pre-update graph for the intended boundary**

```bash
graphify query "Does App.tsx still own Reporting or Reconciliation state, clients, handlers, or render branches?"
```

Expected: the pre-update graph may still report the old direct relationships.

- [ ] **Step 2: Refresh the graph**

```bash
graphify update .
```

Expected: successful AST update with no API call required.

- [ ] **Step 3: Query and inspect the new relationships**

```bash
graphify query "How are App, AuthenticatedShell, ReportingSessionProvider, ReportingFeature, reports-client, and reconciliation-client connected after the refactor?"
graphify path "App()" "createReportsClient()"
graphify path "App()" "createReconciliationClient()"
```

Expected: `App` reaches both clients through the reporting provider rather than calling either factory directly; reporting state and screen nodes belong to the feature module.

- [ ] **Step 4: Run final repository verification**

```bash
npm run test:web
npm run typecheck
npm run lint
npm run format
git diff --check
git status --short
```

Expected: all checks pass. Existing unrelated dirty files remain untouched. Generated `graphify-out/` changes are expected and follow the repository's existing tracking policy.

- [ ] **Step 5: Review completion criteria**

Confirm all statements are true:

- `App` has no report/reconciliation clients, request refs, workflow state, handlers, CSV mappers, or JSX.
- The reporting provider mounts only for an authenticated session and survives view changes.
- Only the active reporting screen renders.
- Navigation and network failures preserve drafts.
- Logout and refresh reset reporting state and start at Person Search.
- Report/reconciliation endpoints are not fetched until their panel is explicitly opened.
- Normal users cannot navigate to or render Reporting.
- The existing report and reconciliation component tests still pass.
- Controller, reducer, screen, shell, and navigation tests cover the new boundaries independently.

- [ ] **Step 6: Commit Graphify artifacts only if they are already tracked**

```bash
git add -u graphify-out
git diff --cached --quiet || git commit -m "chore(graphify): refresh web architecture graph"
```

If `graphify-out/` is entirely untracked, do not add it in this task.
