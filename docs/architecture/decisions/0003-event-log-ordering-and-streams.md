# ADR 0003: Global Ordering and Stream Keys in the Event Log

Status: Superseded by Prisma schema (2026-02-25)

Context
- We need a deterministic global order for sync and replay, and efficient filtering.
- Prisma-backed schema (apps/api/prisma/schema.prisma) does not include `event_sequence` or `stream_*` columns.

Decision
- For now, rely on `(occurred_at, event_id)` ordering for replay; server-side sync cursors can be derived from insertion order if needed.
- Stream filtering is handled via payload-level indexes (for example `payload ->> 'personId'`) instead of explicit `stream_type/stream_id` columns.
- Reintroducing `event_sequence` and stream keys is deferred until we see perf or correctness pressure; if added later, schema and ADR will be updated together.

Consequences
- Simpler schema aligns with Prisma enums/types; fewer columns to populate on insert.
- Payload indexes may be less selective than dedicated stream keys; monitor query plans and add functional indexes as needed.
- Any future change to introduce `event_sequence` will require a migration and ADR update.
