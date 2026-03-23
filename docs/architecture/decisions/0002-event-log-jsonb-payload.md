# ADR 0002: Store Event Payloads as JSONB with a Typed Envelope

Status: Accepted (2026-02-25)

Context

- Event payload shapes are defined in `packages/shared/src/domain/events.ts`.
- We want flexibility to evolve payloads without frequent migrations.
- We need to filter by payload keys and values (for example, `personId`).

Decision

- Store the event envelope as typed columns.
- Store the event payload as `jsonb`.
- Add a GIN index on `payload` for containment queries.

Consequences

- Payload evolution is flexible and does not require adding columns.
- Validation and strict typing remain in application code.
- We may add functional indexes for hot keys as query patterns emerge.
- Typed projection tables can still be added for read models.

References

- `docs/architecture/event_log_schema.sql`
- `docs/architecture/event_log_schema.md`
