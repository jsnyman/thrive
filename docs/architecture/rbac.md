# RBAC

This document defines the initial role-based access control rules for staff users.

## Roles

| Role          | Description                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User          | Can create, edit, and search people; view person details and points ledger; record intake and sales; and submit points or inventory adjustment requests. |
| Administrator | Has full operational control, including inventory moves and adjustments, procurement, expenses, reports, reconciliation, and user administration.        |

## Permission Matrix

| Action                              | User | Administrator |
| ----------------------------------- | ---- | ------------- |
| Log in                              | Yes  | Yes           |
| Read person list and person detail  | Yes  | Yes           |
| Register person                     | Yes  | Yes           |
| Update person profile               | Yes  | Yes           |
| View points ledger                  | Yes  | Yes           |
| Record intake                       | Yes  | Yes           |
| Record sale                         | Yes  | Yes           |
| Read inventory batches and summary  | Yes  | Yes           |
| Request points adjustment           | Yes  | Yes           |
| Apply points adjustment             | No   | Yes           |
| Request inventory adjustment        | Yes  | Yes           |
| Move stock between storage and shop | No   | Yes           |
| Apply inventory adjustment          | No   | Yes           |
| Create or update items              | No   | Yes           |
| Record procurement                  | No   | Yes           |
| Record expenses                     | No   | Yes           |
| View reports                        | No   | Yes           |
| View sync conflicts                 | No   | Yes           |
| Resolve sync conflicts              | No   | Yes           |
| View sync audit report/event        | No   | Yes           |
| Manage users and roles              | No   | Yes           |

## Enforcement Notes

- RBAC is enforced on the server for reads and writes.
- The client mirrors these rules for usability but cannot be the source of truth.
- Standard person API responses mask ID numbers and phone numbers by default for all roles.
- ID numbers and phone numbers are hidden in standard flows for all roles; any explicit reveal requires a deliberate, role-gated action.
