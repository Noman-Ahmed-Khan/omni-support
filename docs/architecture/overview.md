# Architecture Overview

OmniSupport is a multi-tenant support platform with a layered architecture. Dependencies
point inwards; ESLint (`import/no-restricted-paths`) enforces the rules below.

## Layers

1. **Domain (`src/domain`)**: entities, value objects, domain events, repository interfaces and
   policies (e.g. `TicketAccessPolicy`, `RoleAssignmentPolicy`, `SlaPolicy`). No dependencies on
   other layers or frameworks.
2. **Application (`src/application`)**: use-case services and handlers. Coordinates the domain and
   infrastructure; runs aggregate writes, audit records and outbox inserts in one transaction
   (`TransactionManager`). Must not depend on presentation or bootstrap.
3. **Infrastructure (`src/infrastructure`)**: Prisma repositories, Redis cache, BullMQ queues, the
   outbox, realtime (WebSocket gateway and Redis bridge), storage, messaging and security.
4. **Presentation (`src/presentation`)**: Express app, routes, controllers, middlewares, webhooks.
5. **Bootstrap (`src/bootstrap`)**: the composition root. `bootstrap/container` builds the
   dependency graph; `bootstrap/workers.ts` starts queue workers, the outbox relay and scheduled jobs.
6. **Shared (`src/shared`)**: errors, utilities and the `Container` registry type. Depends on nothing.

## Processes

- `src/main.ts` — HTTP API and WebSocket gateway. Runs background processing too unless
  `RUN_WORKERS=false`.
- `src/worker.ts` — queue workers, outbox relay and scheduled jobs only.

Realtime events are published to Redis and every API process forwards them to its own WebSocket
clients, so both processes can raise them.

## Request flow

`auth` → `tenant` (organization must be active; platform admins are unscoped) →
`requireTenantContext` (routes that hold tenant data) → `requireRole` → controller →
application service. Ticket routes additionally check row-level visibility through
`TicketAccessService` before any `/:id` handler runs.

## Decisions

See `docs/architecture/adr/`.
