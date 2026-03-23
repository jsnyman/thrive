# AGENTS

## Purpose

This file defines project-specific instructions for agents working in this repo. Follow these rules in addition to global system guidelines.

## Canonical Context

- Read and follow `AI_CONTEXT.md` before making architecture or data-model decisions.
- Prefer existing patterns in `packages/shared` for domain types and validation.

## Tech Stack Assumptions

- Frontend: React + TypeScript + Vite
- UI: Mantine, strictly responsive
- Offline storage: SQLite in browser via OPFS (e.g., wa-sqlite)
- Sync model: event-sourced sync using an append-only log with server-side merge
- Backend API: Node.js + NestJS
- Database: PostgreSQL for server-side event log + projections

## Non-Negotiable Constraints

- No class-based services
- No global mutable state
- No default exports
- No `any` type
- No implicit returns
- Financial and points changes must be immutable events
- Event log is append-only; never mutate or delete events

## Test-Driven Development (Required)

Use a TDD workflow for all behavior changes:

1. Write or update a failing test that captures the new behavior or bug.
2. Implement the minimal code to pass the test.
3. Refactor while keeping tests green.

For bug fixes, include a regression test. For new features, include unit and integration tests where appropriate.

## Test Commands

- `npm run test:shared` for shared/domain logic
- `npm run test:web` for web UI (Vitest)
- `npm run test:api` for API (Jest)
- `npm run test:e2e` for end-to-end (Playwright)
- `npm run test` to run the full suite
- `npm run typecheck`, `npm run lint`, `npm run format` for quality gates

## Data & Events

- Store events with an immutable envelope (id, type, timestamps, actor, device, schemaVersion, etc.).
- Use domain types from `packages/shared/src/domain` for IDs and enums.
- Prefer typed columns for event projections; use JSONB only when the structure is intentionally fluid.

## PR Hygiene (Local Changes)

- Keep changes small and focused.
- Update or add tests alongside code changes.
- If tests are skipped, state why.

# Four principles to code by

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
