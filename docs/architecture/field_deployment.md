# Field Deployment for Low-Connectivity Sites

This document defines the recommended field layout for swap-shop days where connectivity is intermittent or unavailable for long periods.

## Goals

- Keep collection and shop workflows usable without continuous network access.
- Preserve the internet-hosted server as the canonical system of record.
- Avoid same-day data dependencies that require real-time device-to-device communication.
- Keep the tablet setup simple by using it as a read-only catalog display.

## Device Layout

### Intake Phone

- Typical role: `user`
- Primary workflows:
  - person lookup and registration
  - intake event capture
- Connectivity expectation:
  - must work fully offline
  - syncs when mobile data is available

### Sales Phone

- Typical role: `user`
- Primary workflows:
  - person lookup
  - points balance checks based on last successful sync
  - sales capture
  - inventory adjustment request capture when needed
- Connectivity expectation:
  - must work fully offline
  - syncs when mobile data is available

### Tablet

- Role: no transactional role
- Primary workflow:
  - display item names, prices, and cached product images
- Connectivity expectation:
  - refreshed once before trading starts
  - optional refresh at the end of the day
  - no requirement for live connectivity during trading

### Internet-Hosted Server

- Role:
  - canonical append-only event log
  - canonical projections for people, balances, inventory, and reports
- Connectivity expectation:
  - not continuously reachable from the field
  - devices sync asynchronously when a connection is available

## Operating Model

### Before Departure

- Sync the intake phone to pull the latest people and configuration data.
- Sync the sales phone to pull the latest balances, items, prices, and inventory state.
- Refresh the tablet catalog so that product images and prices are cached locally.
- Confirm the server is reachable and both phones show a recent successful sync timestamp.

### During the Day

- The intake phone records intake offline.
- The sales phone records sales offline.
- The tablet stays read-only and uses the locally cached catalog.
- Staff may trigger `Sync Now` on either phone when signal briefly becomes available, but trading must not depend on that sync succeeding.

### End of Day

- Move both phones to a location with signal if the field site has none.
- Sync the intake phone.
- Sync the sales phone.
- Repeat a second sync cycle on both phones if required to pull newly accepted remote events from the other device.
- Refresh the tablet catalog only after the phones have completed end-of-day sync.

## Critical Business Rule

The sales phone must not assume it knows about points earned on the intake phone after the last successful sync.

That means:

- a customer can spend points that are visible on the sales phone at its last sync
- a customer cannot reliably spend points earned earlier that same day unless the intake phone and sales phone have both synced with the server

This rule is required because the recommended deployment does not rely on direct peer-to-peer device communication, local Wi-Fi, or a field server.

## Why This Layout Fits the Current Architecture

- The web client already follows an offline-first PWA model.
- Each device has local queue and sync-state persistence in OPFS-backed SQLite.
- Sync is append-only and asynchronous against an internet-hosted server.
- Staff can still separate intake and sales workflows across devices even though the RBAC model is now just `user` and `administrator`.
- The tablet can remain outside the transactional workflow and therefore does not add conflict or audit complexity.

## Risks and Mitigations

### Risk: same-day earned points are not visible in the shop

Mitigation:

- make this an explicit staff operating rule
- attempt midday sync only when signal is available
- train staff to treat the sales phone's last synced balance as authoritative for sales

### Risk: stale stock view on the tablet

Mitigation:

- treat the tablet as promotional/catalog display only
- record actual stock decisions on the sales phone
- refresh the tablet before opening and after close, not continuously

### Risk: incomplete end-of-day data upload

Mitigation:

- define a mandatory end-of-day sync checkpoint
- verify both devices report no pending events before sign-off when possible
- keep devices charged so queued events are not stranded on a powered-off phone

## Staff Runbook Summary

1. Morning: sync both phones and refresh the tablet catalog.
2. Trading hours: work offline-first; do not depend on live connectivity.
3. Same-day points: allow spending only if those points are visible on the sales phone.
4. Closing: sync intake phone, then sales phone, then repeat if necessary.

For a shorter staff-facing procedure, see `docs/operations/field_staff_checklist.md`.
For a administrator-facing pilot checklist, see `docs/operations/manager_pilot_readiness_checklist.md`.
For structured pilot scenario execution and evidence capture, see `docs/operations/field_test_plan.md`, `docs/operations/field_test_execution_sheet.md`, and `docs/operations/field_test_findings_log.md`.

## Documentation Layout

The field deployment guidance should stay split across two document types:

- ADR:
  - records the stable architectural choice to use two transactional phones, one read-only tablet, and an internet-hosted server for low-connectivity operations
- Architecture guide:
  - records the practical layout, sync windows, operating rules, and staff runbook
- Operations checklist:
  - records the short day-of-trading procedure for field staff and supervisors
- Field test pack:
  - records structured pilot scenarios, pass/fail expectations, and evidence capture
- Training guides:
  - record role-specific onboarding, practice scenarios, and competency checks

This split keeps long-lived design intent separate from procedures that may evolve during pilot testing.
