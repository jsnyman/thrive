# RBAC

This document defines the initial role-based access control rules for staff users.

## Roles

| Role          | Description                                                                            |
| ------------- | -------------------------------------------------------------------------------------- |
| Collector     | Registers people and records material intake.                                          |
| Shop operator | Records sales and handles shop transactions.                                           |
| Manager       | Full operational control, including procurement, expenses, reporting, and adjustments. |

## Permission Matrix

| Action                              | Collector | Shop operator | Manager |
| ----------------------------------- | --------- | ------------- | ------- |
| Log in                              | Yes       | Yes           | Yes     |
| Read person list                    | Yes       | Yes           | Yes     |
| Register person                     | Yes       | Yes           | Yes     |
| Update person profile               | Yes       | Yes           | Yes     |
| Record intake                       | Yes       | No            | Yes     |
| Record sale                         | No        | Yes           | Yes     |
| Move stock between storage and shop | No        | Yes           | Yes     |
| Create or update items              | No        | No            | Yes     |
| Record procurement                  | No        | No            | Yes     |
| Record expenses                     | No        | No            | Yes     |
| View reports                        | No        | No            | Yes     |
| Request points adjustment           | Yes       | Yes           | Yes     |
| Apply points adjustment             | No        | No            | Yes     |
| Request inventory adjustment        | Yes       | Yes           | Yes     |
| Apply inventory adjustment          | No        | No            | Yes     |
| View sync conflicts                 | No        | No            | Yes     |
| Resolve sync conflicts              | No        | No            | Yes     |
| View sync audit report/event        | No        | No            | Yes     |
| Manage users and roles              | No        | No            | Yes     |

## Enforcement Notes

- RBAC is enforced on the server for reads and writes.
- The client mirrors these rules for usability but cannot be the source of truth.
- Standard person API responses mask ID numbers and phone numbers by default for all roles.
- ID numbers and phone numbers are hidden in standard flows for all roles; any explicit reveal requires a deliberate, role-gated action.
