# Remediation baseline and status (2026-09)

This file records the outcome of the September 2026 audit remediation: what was verified,
and what is still open. Issue IDs (SEC-, BUG-, T-…) refer to the audit plan.

## Verification (2026-09-26)

| Check | Result |
|---|---|
| `npm run lint` (src, tests, scripts, prisma) | pass, 0 warnings |
| `npm run typecheck:all` | pass |
| `npm run format:check` | pass |
| `npm run check:dead-code` | pass: all source files reachable from `main.ts` / `worker.ts` |
| `npm run check:env` | pass: `.env.example` documents the 62 variables read |
| Unit + integration + e2e (`docker-compose.test.yml`) | 179 tests, 26 suites, all pass |
| Coverage (all tiers) | 58% statements, 36% branches, 53% functions, 59% lines (gate set just below) |
| `prisma migrate diff` migrations vs schema | no difference |
| `npm audit --omit=dev` | 0 vulnerabilities |
| App and worker images (`node:22-alpine`) | build, boot, `/health/ready` 200, `/docs` 200, exit code 0 on `SIGTERM` |

## Done

- **Security:** role-change policy (SEC-01); customer-only self sign-up (SEC-02); mandatory tenant
  context (SEC-03); WebSocket rooms follow ticket visibility and origin check (SEC-04); no secret
  fallbacks, pinned HS256 (SEC-05); token families, atomic rotation, suspended users and tenants
  cannot refresh (SEC-06/07/11); OAuth state, verified email, no token in the URL, provider tokens
  no longer stored (SEC-08); row-level ticket visibility (SEC-09); AI queued only, ownership check,
  rate limit, auto-escalation opt-in (SEC-10); Twilio signature validation, tenant routing (SEC-12);
  attachment type sniffing, tenant checks, private signed URLs, PENDING until scanned (SEC-13);
  configurable trust proxy, rate limits on refresh/verify/login per account (SEC-14);
  HTML escaping in emails, organization read check, no default admin password (SEC-15/16/17);
  no account enumeration, progressive lockout (SEC-18); correlation ID validation, `/metrics`
  token, query strings no longer rewritten (SEC-19/21).
- **Reliability:** worker entry point and images (BUG-01/02); enum migration (BUG-03); outbox
  claiming, leases, backoff, dead letters, handler idempotency (BUG-04/05/06/28/29); one
  transaction per ticket/customer write (BUG-07) with the daily ticket limit enforced under
  concurrency (BUG-14); comment and resolution events (BUG-08/09); system actor audits (BUG-10);
  update paths persist all fields (BUG-11/12); AI writes only its column (BUG-13); customer delete
  returns 409 when tickets exist (BUG-15); tenant purge off by default (BUG-16); scheduler locks
  (BUG-17); escalation job per-ticket isolation, pagination, SLA due dates and breach flag
  (BUG-18); UTC analytics, daily-delta snapshots, no N+1, SCAN instead of KEYS (BUG-19/30);
  shutdown (BUG-20); report endpoint returns 501 (BUG-21); queue Redis URL and job ids
  (BUG-22/23); bounded history paging (BUG-24); reopen clears resolution (BUG-25); atomic feature
  flag writes (BUG-26); config-driven token TTLs (BUG-27); single 404 and `/metrics` (BUG-32).
- **Found during remediation:** full-text search never returned results (wrong column names,
  `searchVector` never populated) — fixed with triggers and GIN indexes; tickets accepted an
  assignee from another organization — fixed; tests migrated the development database because
  the global setup did not load `.env.test` — fixed.
- **Structure:** composition root in `src/bootstrap/container`; notification handlers in
  `application/event-bus/handlers`; permission-based RBAC removed (ADR-003); 60+ unreachable files
  deleted; layer rules enforced by ESLint; Redis pub/sub realtime bridge so `RUN_WORKERS=false` is
  safe on the API; config consolidated in `src/config` with startup validation.
- **Tooling:** CI runs on `dev`, type-checks and lints tests/scripts/seeds, checks dead code and
  `.env.example`, boots both images; Trivy pinned to a commit; Node 22; nodemailer 10.
- **Docs:** README, architecture overview, ADR-001 to ADR-003, OpenAPI checked against the router
  by `tests/e2e/openapi-contract.e2e.spec.ts`.

## Behaviour changes to announce

- `POST /auth/register` returns **202** for new and existing emails (was 201 / 409).
- Agents only see, comment on and act on tickets **assigned to them**; customers only see tickets
  of their own customer record; customer records and search are staff-only.
- Platform admins no longer use tenant routes (tickets, customers, comments, attachments, AI).
- AI endpoints queue work and return 202; AI no longer auto-escalates unless the tenant enables
  the `ai.auto_escalation` feature flag.
- Attachment responses no longer contain `publicUrl`; use `GET /attachments/:id/download-url`.
- Newly created tickets get an SLA due date (defaults 4/8/24/72 h by priority, overridable with
  tenant `settings.slaHours`).
- New required configuration: `ENCRYPTION_KEY`; `LOCAL_STORAGE_SECRET` (min 16 chars) for local
  storage; `WHATSAPP_WEBHOOK_URL` replaces `WHATSAPP_WEBHOOK_SECRET`; `/metrics` needs
  `METRICS_TOKEN` in production.
- Inbound WhatsApp messages need a tenant integration (`provider: whatsapp`,
  `config.phoneNumber`) and a CUSTOMER user with the customer's email; otherwise they are kept in
  `webhook_events` with the reason.

## Open

- Repository signatures still accept `tenantId?` for platform-admin user lookups; an explicit
  `TenantScope` type is not in place (ARCH-01, partial).
- Controllers still wrap bodies in `try/catch` although routes use `asyncHandler` (DUP-05), and
  error classes keep their HTTP status (they live in `shared/errors`, not the domain).
- Scheduled jobs still use the Redis-locked in-process scheduler, not BullMQ job schedulers (T-203
  fallback variant implemented).
- Application services still import infrastructure types directly (ARCH-06, opportunistic).
- Major upgrades not done: ESLint 9, Prisma 6/7, express 5, zod 4, openai 7, helmet 8,
  express-rate-limit 8.
- No antivirus scanner is wired (`REQUIRE_AV_SCAN=true` fails closed).
- Tenant purge redesign (OQ-10), invitation-based onboarding (T-102 long form), report
  generation (OQ-11), optimistic locking.
- Not verified here: real Google OAuth, Twilio, OpenAI and S3 calls; load tests.
