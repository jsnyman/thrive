# ADR 0004: Field Deployment Topology for Low-Connectivity Sites

Status: Accepted (2026-03-12)

Context

- Swap-shop events run in locations with intermittent or absent connectivity.
- The product architecture already assumes an offline-first PWA with asynchronous sync to an internet-hosted server.
- Field staff need a simple operating model with clear device responsibilities.
- The tablet is used to display product images and does not need to participate in transactional writes.
- A deployment that depends on live connectivity between collector and shop workflows would fail regularly in the intended field conditions.

Decision

- Use two transactional phones and one read-only tablet for field operations.
- Assign one phone to the `collector` role and one phone to the `shop_operator` role.
- Keep the internet-hosted server as the canonical system of record and sync target.
- Treat the tablet as a cached catalog viewer refreshed before opening and optionally after close.
- Do not require direct device-to-device sync, a local field server, or continuous connectivity during trading.
- Treat the shop phone's last successfully synced balance and inventory view as authoritative for sales decisions during offline operation.

Consequences

- The deployment stays aligned with the existing offline-first event-log architecture and avoids introducing a second sync topology.
- Device responsibilities are simple enough for field staff to follow consistently.
- Same-day points earned on the collector phone are not guaranteed to be spendable in the shop until both devices sync with the server.
- The tablet remains operationally simple because it does not create events or participate in conflict handling.
- End-of-day sync becomes a required operational control, not an optional convenience.

Follow-up

- Maintain the operating details in `docs/architecture/field_deployment.md`.
- Revisit this decision after pilot testing if field evidence shows a strong need for a local hotspot-based sync or a temporary edge server.
