# ADR 0001: Use PostgreSQL for Server-Side Event Log

Status: Accepted (2026-02-25)

Context

- The system is offline-first and event-sourced.
- The server must merge events from multiple devices and keep a durable audit trail.
- We need queryable storage for projections and reporting.

Decision

- Use PostgreSQL as the server-side event log and projection database.
- The event log is append-only; corrections are new events.

Consequences

- We gain strong durability and rich indexing/query support.
- Server-side merge logic can rely on stable, transactional storage.
- We will manage schema migrations for the event log and projections.
