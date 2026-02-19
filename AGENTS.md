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
