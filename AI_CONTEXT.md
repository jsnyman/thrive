# AI Context

## Purpose

This document captures the recommended technology stack for the Recycling Swap-Shop application and the rationale for choosing it. It is intended to guide implementation decisions across frontend, backend, data, sync, and hosting.

## Recommended Tech Stack (Offline-First PWA)

- Frontend: React + TypeScript + Vite
- UI: Mantine with a strictly responsive layout
- Offline storage: SQLite in the browser via OPFS (e.g., wa-sqlite)
- Sync model: Event-sourced sync using an append-only log and merge on the server
- Backend API: Node.js + TypeScript HTTP server
- Database: PostgreSQL for server-side event log + projections
- Auth: Username + passcode with role-based access enforced in the API
- Hosting: Linux VM or managed platform

## Why This Fits the Requirements

- Runs on laptops, cellphones, and tablets via a browser-based PWA.
- Offline-first storage aligns with event-log and audit requirements.
- Asynchronous sync and conflict handling map naturally to an append-only event log with projections.
- Responsive UI supports low-connectivity, mobile contexts without separate apps.

## Notes

- Keep all financial and points-related changes as immutable events.
- Ensure role-based permissions are enforced server-side and in UI.
- Maintain audit trails and retain event logs indefinitely (initially).

## Anti-Patterns (Do Not Introduce)

- No class-based services
- No global mutable state
- No default exports
- No any type
- No implicit returns
