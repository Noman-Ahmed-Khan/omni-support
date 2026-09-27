# omni-support

## Overview

`omni-support` is a TypeScript-based SaaS platform for multi-tenant customer support, ticket management, and AI-assisted workflow automation. The repository combines a REST API, background workers, database persistence, caching, message queue processing, AI services, and notification delivery.

## Architecture

- `src/main.ts` validates configuration, connects to PostgreSQL and Redis, builds the dependency container, and starts the HTTP + WebSocket server.
- Background processing (BullMQ queue workers, the transactional outbox relay, and scheduled jobs) runs inside the API process by default (`RUN_WORKERS=true`). `src/worker.ts` runs the same background processing as a dedicated process; set `RUN_WORKERS=false` on the API when it runs.
  - Realtime (WebSocket) events are published to Redis (`omnisupport:realtime`) and every API process forwards them to its own clients, so events raised by the worker or another API replica reach everyone.
- Ticket and customer writes, their activity/audit records and their domain events are committed in one database transaction. Domain events are written to the `outbox_events` table and delivered by the outbox worker with at-least-once semantics (atomic claiming, lease expiry, exponential backoff, dead-lettering); handlers that already succeeded are not re-run on retry.
- Every authenticated request is scoped to one organization. Routes check effective permissions: the account class defaults (`PLATFORM_ADMIN`, `TENANT_MANAGER`, `AGENT`, `CUSTOMER`) plus bounded tenant role grants (ADR-004). Row-level rules still apply: managers see all tickets, agents see tickets assigned to them, and customers see the tickets of the customer record their account is linked to (`TicketAccessPolicy`). See `docs/architecture/adr/`.
- Accounts are created only through invitations; there is no public sign-up.
- `Prisma` is used for database modeling and migrations.
- `OpenAI`, SMTP email, Twilio, AWS S3, and Google OAuth integrations are configured through environment variables.

## Backend services

| Area                  | Routes                                                                              | What it does                                                                                                                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitations           | `/api/v1/invitations`                                                               | Staff-issued, single-use invitations that expire after 24 hours, for agents, tenant managers (platform route) and customers tied to a customer record. Supports resend and revoke. Accepting creates the account, or links an existing tenantless account whose owner is signed in or gives its password. |
| Staff lifecycle       | `/api/v1/users/:id/{disable,reactivate,remove}`                                     | Disable/reactivate agents; removal moves open tickets and customers to a replacement agent (or unassigns them), revokes sessions and role memberships, and keeps the user row for history.                                                                                                                |
| Roles and permissions | `/api/v1/roles`, `/api/v1/users/:id/permissions`                                    | Permission catalog, read-only system roles, tenant roles and memberships. Grants cannot exceed the granter's own permissions or the member's account class, and never include platform permissions.                                                                                                       |
| Reports               | `/api/v1/reports`                                                                   | Asynchronous ticket/customer CSV or JSON exports and JSON summaries. The worker builds them in batches; downloads use 10-minute signed URLs; files expire after 24 hours and job records after 30 days. Audits record metadata only.                                                                      |
| Channel integrations  | `/api/v1/integrations`                                                              | Tenant WhatsApp number and email sender identity on shared provider credentials: connection test, enable/disable, signing-secret rotation (returned once, stored encrypted).                                                                                                                              |
| Administration        | `/api/v1/admin/audit`                                                               | Filtered audit log for tenant managers (own organization) and platform admins.                                                                                                                                                                                                                            |
| Platform operations   | `/api/v1/admin/{outbox,webhooks,operations,providers,integrations,internal-health}` | Platform admins only, audited: inspect records with redacted payloads, retry, replay (as a new row) or cancel with a required reason, processing settings (pause, retry attempts, retention), purge, redacted provider status and internal table counts.                                                  |

Scheduled jobs in the worker: analytics rollup (daily), ticket escalation (every 15 minutes), report processing (every minute), operations retention (daily) and, when enabled, tenant purge.

## Repository structure

- `src/`
  - `application/` - use-case services, command/query handlers, event handling.
  - `bootstrap/` - composition root: the DI container (`bootstrap/container`) and background processing wiring.
  - `config/` - validated configuration (`startup.ts` fails fast on invalid configuration).
  - `domain/` - entities, value objects, domain events, and policies.
  - `infrastructure/` - database, cache, queues, outbox, messaging, storage, realtime, and security adapters.
  - `presentation/` - HTTP app, routes, controllers, middlewares, and webhooks.
  - `shared/` - errors, utilities, the DI container type. Layer rules are enforced by ESLint (`import/no-restricted-paths`).
  - `main.ts` / `worker.ts` - process entry points.
- `tests/` - unit, integration, and end-to-end test suites.
- `docker/` - Dockerfiles for the app and worker images.
- `prisma/` - schema, migrations, and seed scripts.
- `scripts/` - tenant creation, key generation, health checks, and the pre-push check.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- npm 10 or newer
- Docker and Docker Compose (for container-based development and integration/e2e tests)

## Local development

1. Install dependencies:

```bash
npm install
```

2. Create environment files from the examples and fill in secrets:

```bash
cp .env.example .env
cp .env.test.example .env.test
```

The application refuses to start when required configuration is missing or invalid (for example JWT secrets shorter than 32 characters).

3. Generate the Prisma client and apply migrations:

```bash
npm run db:generate
npm run db:migrate
```

4. Seed the platform administrator (requires `PLATFORM_ADMIN_PASSWORD`, at least 12 characters):

```bash
npm run db:seed
```

5. Start the API in watch mode:

```bash
npm run dev
```

6. Optionally run background processing as a separate process (set `RUN_WORKERS=false` for the API first):

```bash
npm run worker:dev
```

## Docker

```bash
npm run docker:dev    # API, PostgreSQL, Redis
npm run docker:down
```

- PostgreSQL and Redis are published on `127.0.0.1` only.
- The dedicated worker container is opt-in: `docker compose --profile workers up`.
- Development tools (MailHog, Redis Commander) are available with `--profile dev`.

## Environment variables

`.env.example` documents every variable. Security- and runtime-relevant settings:

| Variable                                          | Default                                          | Purpose                                                                          |
| ------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`         | required                                         | Token signing secrets (min 32 chars, no fallbacks)                               |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | `15m`, `30d`                                     | Token lifetimes                                                                  |
| `ENABLE_API_DOCS`                                 | `true` outside production, `false` in production | Serve `/docs`                                                                    |
| `TRUST_PROXY`                                     | `false`                                          | Express trust proxy (`true`, hop count, or proxy IP/CIDR list)                   |
| `RUN_WORKERS`                                     | `true`                                           | Run background processing in this process                                        |
| `ENABLE_TENANT_PURGE`                             | `false`                                          | Permanently delete cancelled tenants (destructive)                               |
| `ENCRYPTION_KEY`                                  | required                                         | Key material for encrypted data (min 32 chars)                                   |
| `LOCAL_STORAGE_SECRET`                            | required for local storage                       | Signs attachment download URLs (min 16 chars)                                    |
| `REQUIRE_AV_SCAN`                                 | `false`                                          | Reject uploads (and unscanned downloads) when no antivirus scanner is configured |
| `METRICS_TOKEN`                                   | -                                                | Bearer token for `GET /metrics`; without it `/metrics` is off in production      |
| `WHATSAPP_WEBHOOK_URL`                            | -                                                | Public webhook URL Twilio signs requests against                                 |
| `REDIS_URL`                                       | -                                                | Redis URL; takes precedence over `REDIS_HOST`/`REDIS_PORT` for cache and queues  |
| `DATABASE_URL`                                    | required                                         | PostgreSQL connection string                                                     |

## Common npm scripts

- `npm run dev` / `npm run worker:dev` - API / worker in watch mode
- `npm run build` - compile TypeScript
- `npm run start` / `npm run worker:start` - run the compiled API / worker
- `npm run lint` - lint `src`, `tests`, `scripts` and `prisma`
- `npm run format` / `npm run format:check` - format / verify formatting
- `npm run typecheck` - type check `src`
- `npm run typecheck:all` - type check `src`, `tests`, `scripts`, and `prisma`
- `npm run check:dead-code` - fail on source files not reachable from `main.ts`/`worker.ts`
- `npm run check:env` - fail when `.env.example` and the variables the code reads differ
- `npm run test:unit`, `npm run test:integration`, `npm run test:e2e` - test tiers
- `npm run test:ci` - all tiers with coverage
- `npm run db:generate`, `npm run db:migrate`, `npm run db:migrate:prod`, `npm run db:seed`, `npm run db:reset`, `npm run db:studio`
- `scripts/pre-push-check.sh` - run the full local CI check (lint, format, typecheck, all tests, build, Docker images)

## Testing

Unit tests need no services. Integration and e2e tests need PostgreSQL and Redis:

```bash
docker compose -f docker-compose.test.yml up -d
DATABASE_URL="postgresql://omnisupport:omnisupport_secret@localhost:5433/omnisupport_test?schema=public" \
REDIS_PORT=6380 npm run test:integration
```

See `docs/TESTING.md` for details.

## API documentation

When `ENABLE_API_DOCS` is enabled, Swagger UI is served at `/docs` and the raw spec at `/docs.json`. The spec lives in `docs/api/openapi.yaml`.

## Contribution

- Keep code organized by layer: `src/domain`, `src/application`, `src/infrastructure`, `src/presentation`.
- Add tests for new features in `tests/unit`, `tests/integration`, or `tests/e2e`.
- Run `scripts/pre-push-check.sh` (or at least lint, `format:check`, `typecheck:all`, and tests) before pushing.

## Diagrams

### Services

The API handles client traffic and inbound webhooks. Background work runs in the worker, with PostgreSQL and Redis shared by both processes.

```mermaid
flowchart TB
    clients["Web and mobile clients"]
    twilio["Twilio WhatsApp"]

    subgraph app["OmniSupport"]
        direction LR
        api["API process — src/main.ts"]
        worker["Worker process — src/worker.ts"]
    end

    subgraph data["Shared data stores"]
        direction LR
        pg[("PostgreSQL")]
        redis[("Redis")]
    end

    subgraph providers["External providers"]
        direction LR
        storage["S3 / local disk"]
        google["Google OAuth"]
        openai["OpenAI"]
        smtp["SMTP"]
    end

    clients -->|"HTTPS · WebSocket /ws"| api
    twilio -->|"Signed webhooks"| api

    api --> pg
    api --> redis
    worker --> pg
    worker --> redis

    api -->|"Files"| storage
    api -->|"Authentication"| google
    worker -->|"AI analysis"| openai
    worker -->|"Email"| smtp
    worker -->|"Outbound messages"| twilio

    classDef process fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A
    classDef datastore fill:#F0FDFA,stroke:#0D9488,color:#134E4A
    classDef external fill:#F8FAFC,stroke:#94A3B8,color:#334155

    class api,worker process
    class pg,redis datastore
    class clients,twilio,storage,google,openai,smtp external
```

| Component  | Responsibilities                                         |
| ---------- | -------------------------------------------------------- |
| API        | REST endpoints, WebSocket connections, inbound webhooks  |
| Worker     | Queues, outbox relay, reports, retention, scheduled jobs |
| PostgreSQL | Tenants, tickets, access, reports, durable outbox events |
| Redis      | Cache, rate limits, BullMQ, realtime pub/sub, locks      |

`RUN_WORKERS=true` (the default) also runs worker duties inside the API process. Set it to `false` when deploying a dedicated worker.

### Application layers

Solid arrows show dependencies; dashed arrows show shared utilities. Bootstrap is the composition root. The current structure allows application services to depend on infrastructure, so dependencies do not point exclusively inward.

```mermaid
flowchart TB
    bootstrap["Bootstrap"]
    presentation["Presentation"]
    application["Application"]
    infrastructure["Infrastructure"]
    domain["Domain"]
    shared["Shared"]

    bootstrap --> presentation
    bootstrap --> application
    bootstrap --> infrastructure

    presentation --> application
    application --> infrastructure
    application --> domain
    infrastructure --> domain

    presentation -.-> shared
    application -.-> shared
    infrastructure -.-> shared
    domain -.-> shared

    classDef composition fill:#F8FAFC,stroke:#64748B,color:#334155
    classDef layer fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A
    classDef core fill:#F0FDFA,stroke:#0D9488,color:#134E4A
    classDef utility fill:#FAF5FF,stroke:#9333EA,color:#581C87

    class bootstrap composition
    class presentation,application,infrastructure layer
    class domain core
    class shared utility
```

| Layer          | Contents                                                                 |
| -------------- | ------------------------------------------------------------------------ |
| Bootstrap      | DI container, process setup, worker wiring                               |
| Presentation   | Express app, routes, controllers, middleware, webhooks                   |
| Application    | Use-case services, access policies, event handlers                       |
| Infrastructure | Prisma repositories, Redis, BullMQ, outbox, storage, messaging, realtime |
| Domain         | Entities, value objects, events, policies                                |
| Shared         | Errors, utilities, container type                                        |

ESLint’s `import/no-restricted-paths` rule enforces these dependency boundaries.

### Request and event flow

Creating a ticket: the write and its events commit together, side effects run later
through the outbox.

```mermaid
sequenceDiagram
    autonumber
    actor Agent
    participant API as API (Express)
    participant PG as PostgreSQL
    participant Q as BullMQ (Redis)
    participant W as Worker
    participant R as Redis pub/sub
    participant WS as WebSocket clients

    Agent->>API: POST /api/v1/tickets
    Note over API: auth, tenant check,<br/>permission and ticket access policy
    API->>PG: BEGIN
    API->>PG: insert ticket, activity, audit
    API->>PG: insert outbox_events (TICKET_CREATED)
    API->>PG: COMMIT
    API->>Q: enqueue AI analysis
    API-->>Agent: 201 Created

    loop every few seconds
        W->>PG: claim events (FOR UPDATE SKIP LOCKED)
    end
    W->>W: notification handlers (email via queue)
    W->>R: publish realtime event
    R-->>API: every API replica receives it
    API-->>WS: push to tenant / ticket / user rooms
    W->>PG: mark event processed (or retry with backoff)
```

### Database

The schema is split by responsibility to keep each view readable. Repeated entities refer to the same tables. See `prisma/schema.prisma` for the complete schema.

Business tables carry `tenantId`; the supplied schema allows it to be null for platform-admin users.

**Tenancy and ownership**

```mermaid
erDiagram
    direction TB

    TENANT ||--o{ USER : "has members"
    TENANT ||--o{ CUSTOMER : has
    TENANT ||--o{ TICKET : has
    TENANT ||--o| TICKET_SEQUENCE : numbers
    TENANT ||--o{ TENANT_INTEGRATION : configures
    TENANT ||--o{ ANALYTICS_SNAPSHOT : "daily stats"

    CUSTOMER ||--o{ TICKET : opens
    USER ||--o{ TICKET : "creates / is assigned"
    USER |o--o{ CUSTOMER : "account manager"

    TENANT {
        string id PK
        string slug UK
        enum status "TRIAL, ACTIVE, SUSPENDED, CANCELLED"
        json settings "Feature flags and SLA hours"
    }

    USER {
        string id PK
        string tenantId FK "Nullable for platform admins"
        string email UK
        enum role "PLATFORM_ADMIN, TENANT_MANAGER, AGENT, CUSTOMER"
    }

    CUSTOMER {
        string id PK
        string tenantId FK
        string email "Unique per tenant"
        float riskScore
    }
```

**Access and onboarding**

Invitations and customer links replace self sign-up. System roles (`tenantId` null) mirror the account classes; tenant roles add bounded grants through memberships.

```mermaid
erDiagram
    direction TB

    TENANT ||--o{ INVITATION : issues
    USER ||--o{ INVITATION : sends
    CUSTOMER |o--o{ INVITATION : "invited for"
    USER ||--o| CUSTOMER_LINK : "portal account"
    CUSTOMER ||--o| CUSTOMER_LINK : "linked record"

    TENANT |o--o{ ROLE : "tenant roles"
    ROLE ||--o{ ROLE_PERMISSION : grants
    PERMISSION ||--o{ ROLE_PERMISSION : "granted by"
    USER ||--o{ USER_ROLE_MEMBERSHIP : holds
    ROLE ||--o{ USER_ROLE_MEMBERSHIP : "held by"

    INVITATION {
        string id PK
        string email
        enum role
        string tokenHash UK "Token only travels by email"
        datetime expiresAt
        datetime acceptedAt
        datetime revokedAt
    }

    CUSTOMER_LINK {
        string userId PK
        string customerId UK
        string tenantId FK
    }

    ROLE {
        string id PK
        string tenantId FK "Null for system roles"
        string name
        boolean isSystem
    }

    PERMISSION {
        string id PK
        string resource
        string action "Key is resource:action"
    }

    USER_ROLE_MEMBERSHIP {
        string userId PK
        string roleId PK
        string tenantId FK
        string assignedById FK
    }
```

**Reports**

```mermaid
erDiagram
    direction TB

    TENANT ||--o{ REPORT_JOB : has
    USER ||--o{ REPORT_JOB : requests

    REPORT_JOB {
        string id PK
        string subject "tickets, customers"
        string kind "export, summary"
        string format "csv, json"
        json filters
        string status "PENDING, RUNNING, COMPLETED, FAILED, CANCELLED, EXPIRED"
        string storagePath "Cleared on expiry"
        datetime expiresAt
    }
```

**Ticket workspace**

```mermaid
erDiagram
    direction TB

    TICKET ||--o{ TICKET_COMMENT : has
    TICKET ||--o{ ATTACHMENT : has
    TICKET_COMMENT |o--o{ ATTACHMENT : has
    USER ||--o{ TICKET_COMMENT : writes

    TICKET ||--o{ ACTIVITY_LOG : history
    TICKET ||--o{ AI_RESULT : analysis
    TICKET ||--o{ NOTIFICATION : triggers
    USER ||--o{ NOTIFICATION : receives

    TICKET {
        string id PK
        string tenantId FK
        int ticketNumber "Per tenant"
        string customerId FK
        string assignedAgentId FK
        enum status
        enum priority
        datetime dueAt "SLA deadline"
        tsvector searchVector "Full-text search"
    }

    TICKET_COMMENT {
        string id PK
        string ticketId FK
        enum type "PUBLIC, INTERNAL"
    }

    ATTACHMENT {
        string id PK
        string storagePath
        enum status "PENDING until scanned"
    }
```

**Identity and audit**

```mermaid
erDiagram
    direction TB

    USER ||--o{ REFRESH_TOKEN : sessions
    USER ||--o{ OAUTH_ACCOUNT : "signs in with"
    USER |o--o{ AUDIT_LOG : "acts in"

    REFRESH_TOKEN {
        string id PK
        string familyId "Rotation chain"
        boolean isRevoked
    }

    AUDIT_LOG {
        string id PK
        enum action
        string resource
    }
```

**Event processing**

These tables are standalone. Outbox rows identify their aggregate through `aggregateId`; webhook rows retain the raw provider payload. Payloads are never edited: an operator replay inserts a new row pointing at the original through `replayOfId`, and a partial unique index allows only one unfinished replay per event. Every operator action is recorded as an intervention.

```mermaid
erDiagram
    direction TB

    OUTBOX_EVENT {
        uuid id PK
        string eventId UK
        string status "PENDING, PROCESSING, FAILED, PROCESSED, DEAD_LETTER, CANCELLED"
        int attempts
        datetime lockedAt "Worker lease"
        uuid replayOfId "Set on operator replays"
    }

    WEBHOOK_EVENT {
        string id PK
        enum eventType
        string status "RECEIVED, PROCESSING, PROCESSED, SKIPPED, FAILED, CANCELLED"
        datetime lockedAt "Processing lease"
        string replayOfId "Set on operator replays"
    }

    OPERATIONAL_INTERVENTION {
        string id PK
        string targetType "outbox, webhook, settings"
        string action "RETRY, REPLAY, CANCEL, CONFIGURE, PURGE"
        string reason "Required"
        string actorId
        string resultId "Row created by a replay"
    }

    OPERATIONAL_SETTING {
        string key PK "outboxPaused, retryMaxAttempts, retention days"
        json value
    }
```
