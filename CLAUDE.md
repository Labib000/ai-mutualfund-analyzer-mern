# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hisaab is a mutual fund portfolio tracker for Indian investors, written as a TypeScript MERN rebuild of an earlier Laravel app in `../Hisaab`. **That Laravel app is the spec.** Its rules, tests and UI define the expected behaviour, and ported calculations have to pass the same cases as the PHP version. `PLAN.md` holds the phases, the dated "Revision" decision log and the working agreement. Read the relevant revision before you change a behaviour, because many deviations from Laravel were deliberate.

## Working agreement (from PLAN.md)

- Discuss the approach before coding a new phase or a significant feature, and wait for approval.
- Ask before adding any npm package that PLAN.md doesn't list.
- When porting from Laravel, port its tests along with the code.
- Keep commits small. Never add Claude attribution to commits or PRs.
- If PLAN.md is wrong or unclear, say so instead of working around it.
- Current status: Phase 4.4 (optional Redis behind the existing Mongo seams) is in progress, and Phase 4.5 (RAG) is on hold. `REDIS_PENDING.md`, `RAG_PENDING.md` and the `*_STUDY_GUIDE.md` files are the user's study material and checklists. The user writes answers in them, so don't fill them in unless asked.

## Commands

It's an npm workspaces monorepo (`shared`, `client`, `server`). Run commands from the repo root. Most root scripts build `shared` first, because client and server import its compiled `dist/`.

```bash
npm run dev            # shared (tsc watch) + server (tsx watch, :3000) + client (vite, :5173, proxies /api and /internal)
npm test               # build shared, then server and client vitest suites
npm run typecheck      # all workspaces
npm run check          # vite-plus lint + format (oxlint/oxfmt), warnings are errors; check:fix to fix
npm run build          # shared → client → server; npm start serves client/dist from the server
npm run job:nav-import # import AMFI NAVs (-- --file=NAVAll.txt for a local file)
npm run db:seed        # demo user test@example.com / password

# Load testing (see server/load/README.md); k6 runs in Docker
npm run db:seed:load   # load-user-<n>@load.test users + synthetic schemes (AMFI 990001+); --reset, --clear-cache
npm run load:server    # built server on :3000, LOG_LEVEL=warn
npm run load -- dashboard   # health | login | dashboard | holdings | compare | mixed; RATE=, DURATION=, P95=
npm run grafana:up     # Prometheus :9090 + Grafana :3001 (dashboard provisioned from server/load/grafana/); grafana:down
```

To run a single test file or test (build `shared` first if it changed):

```bash
npm run build -w shared
npm test -w server -- test/portfolio/xirr.test.ts
npm test -w server -- -t "name of test"
npm test -w client -- src/lib/format.test.ts
```

CI (`.github/workflows/ci.yml`) runs `check`, `typecheck`, `test` and `build` on Node 24.

Formatting: 4-space indent, single quotes, 80 columns. `client/src/components/ui/*` (shadcn) is excluded from lint and format.

## Architecture

**One origin, one Node app.** Express serves the API at `/api`, the cron job endpoints at `/internal/jobs/*` (protected by the `X-Cron-Secret` header, and off when `CRON_SECRET` is unset), and in production the built React SPA. Hosting is Hostinger shared Node hosting, so there are **no background workers, in-process schedulers or required Redis**. Scheduled work (NAV import, SIP generation) runs inside an HTTP request called by an external cron job, and a `jobLocks` collection stops overlapping runs. The same jobs have CLI entry points in `server/src/cli/`.

**Server wiring (`server/src/app.ts`).** `createApp(options)` builds everything through dependency injection: the mailer, password policy, `fetch`, `NavProvider` (mfapi.in) and `AiProvider` (Groq). Tests pass fakes from `server/test/support/` (`FakeNavProvider`, `FakeAiProvider`, `FakeMailer`). Routers in `routes/` are thin. Business logic lives in `portfolio/` (framework-free maths: FIFO lots, XIRR, unit ledger, fund stats, insights), `portfolio/actions/` (writes), `nav/` (AMFI parser and importer, `NavLookup`), `ai/` and `auth/`. `config.ts` validates env with Zod at boot.

**API middleware order:** health → same-origin `Origin` check → JSON → `express-session` (cookie session stored in Mongo through connect-mongo) → `loadUser`. Auth uses cookie sessions, not JWT. CSRF protection comes from `SameSite=Lax` plus the Origin check, so test agents must send `Origin`.

**Conventions:**
- **Money** is integer paise in fields ending in `Paise`.
- **NAVs and units** are normalised decimal strings (NAV 4 dp, units 3 dp). All arithmetic goes through the `decimal.js` wrapper in `server/src/lib/decimal.ts`, with half-away-from-zero rounding to match PHP bcmath. Never convert NAVs or units to JS `number`. Only derived rates (XIRR, CAGR, volatility) are floats.
- **Dates** are IST `"YYYY-MM-DD"` strings. Always use `today()` / `now()` from `server/src/lib/today.ts`, never `new Date()` for business dates. Tests freeze the clock with `setTestNow()`.
- **Requests and responses:** request bodies keep Laravel's snake_case field names (`txn_date`, `day_of_month`) so 422 keys match, and responses are camelCase. A business-rule failure throws `ValidationError`, which the error handler turns into a 422. Errors are `{ message, errors? }`, which the client's `ApiError` (`client/src/lib/api.ts`) maps to form field errors.
- **Concurrency:** redemptions, deletes and SIP generation run in a Mongo transaction (`inTransaction`), and their first write is `lockHolding()`, which bumps `holding.version` so that concurrent writes conflict and retry. Cascading deletes are done by hand inside the transaction. This needs a replica set (Atlas, or the in-memory replica set in tests).
- **Caching:** `lib/cache.ts` (`cacheGet`/`cachePut` over a Mongo `cache` collection with a TTL index). Keys use version or hash prefixes (e.g. stats `v2|`, `scheme-compare:<id>`), so changing a computed shape means bumping the key. `cache.ts`, `rateLimitStore.ts` and `jobLock.ts` are the seams Phase 4.4 puts Redis behind, with a Mongo fallback.

**Metrics.** `lib/metrics.ts` records each event twice: in a resettable JSON registry (Node built-ins) and in `prom-client` histograms and counters (prefixed `hisaab_`, plus Node's default metrics). It covers latency per route, Mongo commands per request (counted through AsyncLocalStorage and the driver's command events, wired in `db.ts`), cache hits by key prefix, jobs, event-loop delay and memory. Read it at `GET /internal/metrics` (JSON, cleared by `POST /internal/metrics/reset`) or `GET /internal/metrics/prometheus`. All of these are behind the cron secret, which can also be sent as `Authorization: Bearer`. If you rename a Prometheus metric, update `server/load/grafana/dashboards/hisaab-load.json` too. A new cache store or job should report to it too.

**AI.** Every provider call goes through `RunAiFeature` (quota check, then the call, then an `aiUsage` log row). The monthly per-user quota counts successful calls. The AI only sees computed figures from `portfolioContext` and never PII. It must explain and never advise. The prompts in `ai/prompts.ts` are copied byte for byte from Laravel and pinned by tests.

**RAG (in progress).** `server/rag/manifest.json` lists the fund PDFs. The PDFs themselves are gitignored and live in `server/rag/docs/`. The `fundDocument`/`docChunk` models and PDF text extraction exist, but search and answers don't yet.

**Shared (`@hisaab/shared`).** Types, Zod schemas, money helpers and `shortSchemeName()` used by both sides. It's consumed from `shared/dist`, so rebuild it (or keep `npm run dev` running) after you edit it.

**Client.** React 19 with the React Compiler, React Router (`routes.tsx` with guards from `components/guards.tsx`), TanStack Query hooks in `hooks/` (`use-portfolio`, `use-ai`, `use-user`), Tailwind 4 and shadcn/Radix in `components/ui`, and Recharts. The `@` alias points to `client/src`. Pure logic lives in `client/src/lib/` with co-located `*.test.ts`. Filters, sorts and SIP calculator or compare scenarios are kept in the URL so they can be shared. Layouts must work down to a 360 px width.

## Testing

Server tests (`server/test/**`) use Vitest and Supertest against one `mongodb-memory-server` **replica set** started in `globalSetup` (the first run downloads mongod). Each test file calls `useTestDb()` to get its own database, and collections are emptied before each test. `makeTestApp()`, `createUser()` and `loginAs()` in `test/support/app.ts` build an app and an authenticated agent. Portfolio fixtures are in `test/support/portfolio.ts`, and several feature tests check figures against the Laravel app. Tests run with `TZ=UTC` and `NODE_ENV=test`.
