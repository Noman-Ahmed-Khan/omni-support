# ADR-003: Role checks plus resource policies (no permission tables)

- Status: Superseded by ADR-004
- Date: 2026-09-26

## Context

Two authorization systems existed: `requireRole` (used) and a permission-based stack
(`requirePermission`, `AuthorizationService`, permission cache, seeded role/permission tables)
that nothing used. Readers assumed the permission tables were enforced. The real gaps were
row-level (which ticket a user may see), not permission-level.

## Decision

- Keep coarse role checks (`requireRole`) at the route level.
- Put row-level rules in explicit policies (`TicketAccessPolicy`, `RoleAssignmentPolicy`).
- Delete the unused permission stack and its seeds. The `roles`, `permissions` and
  `role_permissions` tables stay for now and can be dropped in a later migration once no
  environment relies on them.

## Consequences

Per-tenant custom roles are not supported. If they are needed, a permission model can be
reintroduced with tests that cover every route.
