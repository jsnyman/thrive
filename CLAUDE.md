# CLAUDE.md

## Project Overview

Recycling Swap-Shop — an offline-first PWA for managing recycling exchanges with points and financial tracking.

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **UI:** Mantine (strictly responsive)
- **Offline storage:** SQLite in browser via OPFS (e.g., wa-sqlite)
- **Sync model:** Event-sourced, append-only log with server-side merge
- **Backend:** Node.js + NestJS + TypeScript
- **Database:** PostgreSQL (event log + projections)
- **Auth:** Username + passcode, role-based access enforced server-side

## Hard Constraints

- No class-based services
- No global mutable state
- No default exports
- No `any` type
- No implicit returns
- Financial and points changes must be immutable events
- Event log is append-only — never mutate or delete events

## Architecture Decisions

- Domain types and validation live in `packages/shared/src/domain` — prefer them over local types.
- Store events with an immutable envelope: `id`, `type`, `timestamps`, `actor`, `device`, `schemaVersion`.
- Use typed columns for event projections; JSONB only when structure is intentionally fluid.
- Role-based permissions enforced both server-side and in UI.
- Audit trails and event logs retained indefinitely.

## Test Commands

```
npm run test:shared   # shared/domain logic
npm run test:web      # web UI (Vitest)
npm run test:api      # API (Jest)
npm run test:e2e      # end-to-end (Playwright)
npm run test          # full suite
npm run typecheck
npm run lint
npm run format
```

## Development Workflow

**TDD is required for all behavior changes:**

1. Write a failing test that captures the new behavior or bug.
2. Implement the minimal code to make it pass.
3. Refactor while keeping tests green.

Bug fixes require a regression test. New features require unit and integration tests.

## Four Principles

### 1. Think Before Coding

- State assumptions explicitly — ask if uncertain.
- Surface tradeoffs and multiple interpretations rather than picking silently.
- If something is unclear, stop and ask.

### 2. Simplicity First

- Minimum code that solves the problem. Nothing speculative.
- No abstractions for single-use code.
- No unrequested flexibility or configurability.
- If it could be 50 lines, don't write 200.

### 3. Surgical Changes

- Touch only what the task requires.
- Don't improve adjacent code, comments, or formatting.
- Match existing style even if you'd do it differently.
- Remove only imports/variables made unused by **your** changes.
- Mention unrelated dead code — don't delete it.

### 4. Goal-Driven Execution

Transform tasks into verifiable goals before starting:

- "Add validation" → write tests for invalid inputs, then make them pass.
- "Fix the bug" → write a test that reproduces it, then make it pass.
- "Refactor X" → ensure tests pass before and after.

For multi-step tasks, state a brief plan with a verify step for each item.
