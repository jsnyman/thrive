# ADR 0005: Feature Controllers with Session-Scoped State

Status: Accepted (2026-07-26)

Context

- The web UI currently uses one large `App` component as its navigation controller, workflow coordinator, state owner, and renderer.
- At the time of this decision, `apps/web/src/App.tsx` is approximately 6,500 lines and contains more than 200 React state declarations across 18 view states.
- Navigation handlers reset selected fields manually. This allows state from one workflow to leak into another workflow or leaves UI elements visible after their owning workflow is no longer active.
- Fixing each leak separately does not address the underlying lack of state ownership boundaries.
- Operators need unfinished drafts to survive navigation during the current authenticated session. Drafts do not need to survive logout, refresh, browser restart, or device restart.
- The application does not need deep links, browser Back/Forward navigation, or restoration of the active screen after refresh. A new session starts at Person Search.
- Automated security testing must remain possible, but security does not depend on distinct client-side URLs. The API remains the authoritative authorization boundary.
- Project constraints prohibit class-based services and global mutable state.

Decision

- Keep deterministic in-app, view-state navigation. Do not introduce a client-side router.
- Make `App` a thin composition root and use an authenticated application shell for navigation, permissions, sync controls, startup warnings, and shared reference data.
- Divide the web UI into business feature modules:
  - People
  - Collection
  - Sales
  - Procurement and Expenses
  - Inventory and Item Administration
  - Adjustments
  - Reporting and Reconciliation
  - Collection Point and Material Administration
  - User Administration
- Give each feature a functional controller hook or typed reducer, screen components, and focused tests. Do not implement controllers as classes.
- Keep feature controllers mounted for the authenticated session through session-scoped feature providers. Render only the active screen.
- Expose intent-level controller actions, such as `updateDraft`, `submit`, `cancelDraft`, `selectPerson`, and `runReport`, instead of exposing raw React state setters.
- Keep controller interfaces narrow and typed. A feature must not access another feature's internal setters or state representation.
- Keep reusable visual components stateless where practical. Keep modals and panels inside the feature that owns them.
- Continue to use functional client modules for API access and types and validation from `packages/shared/src/domain`.

State Lifecycle

- Changing the active view does not reset feature state.
- Each feature defines an explicit initial state and reset action.
- Successful completion resets only the completed draft and requests the necessary shared-data refreshes.
- Validation, authorization, sync, and network failures preserve the draft for correction or retry. Only operation status and error state change.
- An explicit Cancel action resets only its current draft.
- Logout, refresh, or restart destroys all feature-controller state. Login starts at Person Search.
- Reference data used by multiple features, including people, materials, items, inventory batches, collection points, and the authenticated user, has one shared owner above the feature controllers.
- Feature-specific results, selections, filters, and applied filters remain in their owning feature controller.

Validation

- Add characterization tests before moving existing behavior.
- Unit-test reducers as pure state transitions, including initial state, editing, explicit reset, successful completion, and failure preservation.
- Test controllers with mocked clients for request construction, operation-state transitions, stale responses, refresh requests, and failure behavior.
- Test screens independently against typed controller fixtures.
- Keep shell integration coverage proving:
  - only the active screen is rendered;
  - navigation preserves each feature's draft;
  - completion resets only the completed draft;
  - failures preserve drafts;
  - logout and refresh start a clean session at Person Search;
  - unauthorized views cannot be entered or rendered; and
  - inactive features cannot leave visible modals or panels.
- Retain end-to-end coverage for critical operator workflows.
- Support automated penetration testing through deterministic accessible navigation and direct API testing. Never treat a hidden or unreachable client view as an authorization control.

Migration

1. Characterize existing navigation and state-lifecycle behavior with tests and introduce typed navigation and controller contracts.
2. Introduce the authenticated shell and shared reference-data boundary without changing visible behavior.
3. Extract Reporting and Reconciliation as the lower-risk proof of the pattern.
4. Extract administration features: Users, Collection Points, Materials, Items, Procurement, and Expenses.
5. Extract Adjustments.
6. Extract Collection and Sales while preserving their collection-point session rules.
7. Extract People last because person state currently connects several workflows.
8. Remove remaining business draft state, API orchestration, and workflow rendering branches from `App`.

Each extraction is behavior-preserving and independently validated. The migration does not include a router or a visual redesign.

Consequences

- Drafts remain available when an operator temporarily visits another feature, without allowing one feature's state to control another feature's UI.
- Feature state, behavior, and tests become independently understandable and changeable.
- The shell and shared reference-data boundary remain deliberate integration points and require focused integration tests.
- Session-scoped providers add explicit composition and controller interfaces, but avoid a global mutable store.
- During migration, old and extracted code coexist temporarily. Characterization and integration tests are required to prevent behavior drift.
- The decision is complete when `App` contains no business-workflow draft state or API orchestration and no controller reaches into another controller's internals.

Alternatives Considered

- A single application reducer would make transitions explicit but preserve a central controller and broad test boundary.
- Keeping all screen components mounted but hidden would preserve drafts with less refactoring, but hidden screens could continue effects or retain interactive UI state.
- Adding a client-side router would improve deep linking and browser history, but those capabilities are not required and would not by itself solve feature state ownership.
