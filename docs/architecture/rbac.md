# RBAC

This document defines the initial role-based access control rules for staff users.

## Roles

| Role          | Description                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User          | Can create, edit, and search people; view person details and points ledger; record intake and sales; and submit points or inventory adjustment requests. |
| Administrator | Has full operational control, including inventory moves and adjustments, procurement, expenses, reports, reconciliation, and user administration.        |

## Permission Matrix

The `Code` column maps each action to the dotted permission identifier enforced in `apps/api/src/auth/permissions.ts`. Login is implicit (any authenticated request); all other rows correspond to a `PermissionAction`.

| Action                              | Code                           | User | Administrator |
| ----------------------------------- | ------------------------------ | ---- | ------------- |
| Log in                              | _(implicit, any valid token)_  | Yes  | Yes           |
| Read person list and person detail  | `person.read`                  | Yes  | Yes           |
| Register person                     | `person.create`                | Yes  | Yes           |
| Update person profile               | `person.update`                | Yes  | Yes           |
| View points ledger                  | `person.read`                  | Yes  | Yes           |
| Record intake                       | `intake.record`                | Yes  | Yes           |
| Record sale                         | `sale.record`                  | Yes  | Yes           |
| Read inventory batches and summary  | `inventory.read`               | Yes  | Yes           |
| Request points adjustment           | `points.adjustment.request`    | Yes  | Yes           |
| Apply points adjustment             | `points.adjustment.apply`      | No   | Yes           |
| Request inventory adjustment        | `inventory.adjustment.request` | Yes  | Yes           |
| Move stock between storage and shop | `inventory.move`               | No   | Yes           |
| Apply inventory adjustment          | `inventory.adjustment.apply`   | No   | Yes           |
| Create or update items              | `item.manage`                  | No   | Yes           |
| Record procurement                  | `procurement.record`           | No   | Yes           |
| Record expenses                     | `expense.record`               | No   | Yes           |
| View reports                        | `reports.view`                 | No   | Yes           |
| View sync conflicts                 | `conflict.view`                | No   | Yes           |
| Resolve sync conflicts              | `conflict.resolve`             | No   | Yes           |
| View sync audit report/event        | `audit.view`                   | No   | Yes           |
| Manage users and roles              | `users.manage`                 | No   | Yes           |

## Enforcement Notes

- RBAC is enforced on the server for reads and writes.
- The client mirrors these rules for usability but cannot be the source of truth.
- Standard person API responses mask ID numbers and phone numbers by default for all roles.
- ID numbers and phone numbers are hidden in standard flows for all roles; any explicit reveal requires a deliberate, role-gated action.
