# ADR-004: Account classes plus bounded tenant permissions

- Status: Accepted
- Date: 2026-09-28
- Supersedes: ADR-003

## Context

Organizations need to give some agents more access (analytics, assignment, audit) without
making them tenant managers. ADR-003 kept only four fixed roles, so any change meant
changing a user's role and everything that comes with it.

## Decision

- The four system roles (`PLATFORM_ADMIN`, `TENANT_MANAGER`, `AGENT`, `CUSTOMER`) stay as
  account classes stored on `users.role`.
- Routes check permissions (`requirePermission('tickets:assign')`) instead of roles. The
  catalog lives in `src/domain/policies/permission.catalog.ts`.
- Effective permissions are `defaults(class) ∪ (tenant role grants ∩ boundary(class))`.
  Defaults are exactly what each class could do before, so switching route checks did
  not change anyone's access. Migration `20260928000200_permissions` seeds the catalog
  and one read-only system role per class with those defaults.
- Tenant managers create tenant roles (`roles`, `role_permissions`) and grant them via
  `user_role_memberships`. They can only grant tenant permissions they hold, never
  `platform:*`, and never beyond the member's class boundary (agents cannot receive
  user, invitation, role or integration management; customers cannot receive staff
  permissions). System roles cannot be modified.
- The same `PermissionService` backs HTTP routes, the report worker and WebSocket
  tenant rooms (`realtime:tenant`). Row-level rules (`TicketAccessPolicy`, agent report
  scoping) still apply on top.

## Consequences

Each permission-checked request makes one membership query for tenant users. Adding a
permission means updating the catalog, a migration that seeds it, and route checks; the
unit test `permission-catalog.spec.ts` fails if the catalog and the migration disagree.
