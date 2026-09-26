# ADR-001: Tenant scoping and ticket visibility

- Status: Accepted
- Date: 2026-09-26

## Context

Tenant scoping was opt-in: a missing `tenantId` in a repository call meant "all tenants".
Several routers did not run the tenant middleware, so tenant-less accounts and platform
admins could read other organizations' users, attachments and AI results. Inside an
organization, customers could read every ticket and customer record.

## Decision

1. Every authenticated router runs `createTenantMiddleware`. Routes that hold tenant data also
   run `requireTenantContext`, which rejects requests without an organization (platform admins
   use the platform routes instead).
2. Self-registration creates tenant-less `CUSTOMER` accounts only (and can be disabled with
   `ALLOW_PUBLIC_REGISTRATION=false`, the production default).
3. Row-level visibility lives in `TicketAccessPolicy` (domain) and `TicketAccessService`
   (application): managers see all tickets, agents their assigned tickets, customers the tickets
   of the customer record with their email. It is applied to ticket routes (`router.param('id')`),
   listings, search, attachments, AI routes and WebSocket ticket rooms.
4. Customer records and search are staff-only.

## Consequences

- Platform admins no longer read tenant tickets or customers through tenant routes.
- Agents cannot comment on or view tickets that are not assigned to them.
- Remaining work: repository signatures still accept `tenantId?` for user lookups used by
  platform admins; converting them to an explicit `TenantScope` type is tracked in the plan.
