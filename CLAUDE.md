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

- No changes should be made when prompted with a question, always ask before implementing
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

Test-Driven Development

**Write tests first. Implementation follows. Expand coverage whenever you touch code.**

### New development

- Before writing any implementation code, write the tests that define expected behaviour.
- Start with unit tests. Add functional/integration tests as complexity warrants.
- Red → Green → Refactor: tests must fail first, then pass, then be cleaned up.
- If you can't write a test for it, question whether the design is right.
- Tests are the specification. Implementation is just the means to satisfy them.

### Expanding existing coverage

- If you touch code that has no unit or functional test coverage, you **must** propose new tests for it — even if the user didn't ask.
- State the gap explicitly: _"This method/class has no test coverage. Here are the tests I recommend adding:"_ then list them.
- Do not silently leave uncovered code as-is. Naming the gap is the minimum; writing the tests is preferred.
- The existing test suite is a floor, not a ceiling. Every session should leave coverage equal to or greater than it started.

### Coverage expectations

- Unit tests: every non-trivial method, including edge cases and failure paths.
- Functional tests: every public API endpoint or service boundary.
- If a piece of logic is too tangled to test cleanly, flag it as a design smell before writing workaround tests.

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
