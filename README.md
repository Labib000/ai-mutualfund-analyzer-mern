<p align="center">
  <img src="client/public/webAssets/hisaab-icon-512.png" alt="Hisaab" width="88" />
</p>

<h1 align="center">Hisaab</h1>

<p align="center">
  A mutual fund portfolio tracker for Indian investors, with exact numbers and AI that explains but never advises.
</p>

<p align="center">
  <a href="https://github.com/Labib000/ai-mutualfund-analyzer-mern/actions/workflows/ci.yml"><img src="https://github.com/Labib000/ai-mutualfund-analyzer-mern/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
</p>

**Hisaab** (हिसाब, "the accounts") shows what your mutual funds are really worth. Add the funds you hold, record purchases, redemptions and SIPs, and see your portfolio valued at the latest AMFI NAVs, with FIFO cost, realised and unrealised gains, and XIRR.

It's a MERN (MongoDB, Express, React, Node) rebuild of an earlier Laravel app, written in TypeScript end to end.

> **Status:** the tracker, insights and AI features are done, and so are monitoring, load testing and an optional Redis layer. The last Redis step, repeating the measurements, is in progress. Fund document answers (RAG) are on hold until then. See the [roadmap](#roadmap).

## Contents

- [Why Hisaab](#why-hisaab)
- [Features](#features)
- [How it works](#how-it-works)
- [Scaling and monitoring](#scaling-and-monitoring)
- [Redis](#redis)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Scheduled jobs](#scheduled-jobs)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Disclaimer](#disclaimer)

## Why Hisaab

- **The numbers are exact.** Money is stored as integer paise, and NAVs and units as fixed-precision decimals, so there's no floating-point drift.
- **The AI only explains.** It works from figures the app has already calculated, never recommends buying or selling, and always shows a disclaimer.
- **It covers the whole market.** Daily NAVs for about 14,000 schemes come straight from AMFI.
- **It runs on simple hosting.** There are no background workers or in-process schedulers, so one Node app is enough. Redis is an optional extra: without it, everything runs on MongoDB.
- **It's measured.** Every request's latency, database queries and cache use are tracked. Load tests with live Grafana dashboards showed MongoDB was the bottleneck, and Redis cut p95 latency at 10 requests a second from 4.2 s to 0.57 s.

## Features

### Tracking

- **Fund search:** search every active scheme by name, fund house or category, with fund house logos and a marker on funds you already hold.
- **Transactions:** purchases, redemptions (including "redeem all units") and stamp duty, with checks that you never sell more units than you hold.
- **SIPs:** monthly SIPs whose installments are recorded automatically once each day's NAV is published. Holidays use the next available NAV.
- **Accurate returns:** FIFO cost, so redemptions sell the oldest units first, and XIRR per fund and for the whole portfolio.

### Understanding your portfolio

- **Dashboard:** current value, invested and gain; value over time against money invested; allocation by asset class and category; top holdings.
- **Portfolio page:** filter by asset class, search and sort by value, gain, XIRR and more. It shows each fund's weight and a totals row, and keeps the filters and sort in the URL.
- **Fund page:** summary, fund facts (1, 3 and 5-year returns, volatility, largest fall), SIPs and a paginated transaction history.
- **Insights:** what changed over 7 days, 30 days or this month (new money vs market movement), and plain observations such as one fund or fund house holding most of your money.

### AI explanations

Powered by [Groq](https://groq.com):

- A plain-language summary of your portfolio.
- "Explain this" for a period's change, and "Explain this fund" for any fund.
- An Ask page for questions about your own figures.

The AI only sees computed figures (never your name, email or transactions), and each user gets 20 requests a month.

### Tools

- **SIP calculator:** "I can invest" (future value) and "I want to reach" (monthly SIP needed), with step-up, inflation-adjusted value, milestones, a growth chart and a year-by-year table.
- **Fund compare:** up to three funds side by side, held or not:
  - growth of ₹10,000 over 1, 3, 5 years or the longest common period;
  - trailing, calendar-year and rolling returns;
  - volatility, Sharpe and Sortino ratios, and the largest fall with its recovery;
  - what a ₹10,000 monthly SIP would have made.

Every SIP scenario and comparison can be shared by URL.

### Accounts

Register, email verification, password reset, profile and appearance settings (light, dark or system). The app is built to work from a 360 px phone to a wide desktop.

## How it works

```
                         Browser (React)
                               |
                               v
       Node app: Express API + the built React client  <---- scraped ----  Prometheus -> Grafana
          |                |                |                     |         (local, for load tests)
          v                v                v                     v
    MongoDB Atlas      Redis          Groq API      AMFI and mfapi.in (NAV data)
                     (optional)
```

The client and API share one origin, so there's one app to deploy.

| Decision | Why |
|---|---|
| Money in integer paise | Avoids floating-point rounding errors |
| NAVs and units as decimal strings, calculated with `decimal.js` | Keeps exact precision (4 dp for NAVs, 3 dp for units) |
| Dates as IST `YYYY-MM-DD` strings | Avoids timezone drift, and they still sort correctly |
| Cookie sessions rather than JWT | Logout and revocation work directly, and nothing sensitive sits in `localStorage` |
| Mongo transactions for redemptions, deletes and SIP generation | Concurrent writes can't oversell a holding |
| Scheduled work through HTTP endpoints | The app can restart or idle without losing jobs |
| XIRR using Newton-Raphson with a bisection fallback | Follows Excel's convention, and still finds an answer when Newton's method fails |
| Metrics kept in the app with `prom-client`, read by Prometheus | Works on shared hosting: no agent to install, just one endpoint behind a secret |
| Redis behind the existing cache, rate-limit and lock code, optional | Faster when Redis is there, and the app still works without it (see [Redis](#redis)) |

### Fund document answers (on hold)

Some questions can't be calculated, such as a fund's exit load or objective. These answers live in fund documents, so this work adds citation-backed RAG to the Ask page:

```
Fund PDFs -> extract text -> chunks -> embeddings (Gemini) -> MongoDB Atlas

Question -> router -> portfolio figures (exact, unchanged)
                   -> document search -> Groq answers with citations
```

Personal figures will always come from the app's calculations, never from retrieved text.

**Done so far:** the document list and its validation, PDF text extraction, and the database models. Search and answers aren't built yet, so the Ask page doesn't use documents today. This work resumes after the Redis phase.

## Scaling and monitoring

Before changing anything for speed, Hisaab measures itself. The app records what every request costs, a load tester sends realistic traffic, and Grafana shows both live.

### What's measured

| Metric | Why it matters |
|---|---|
| Latency p50 / p95 / p99 per route | Averages hide slow requests; the tail is what users feel |
| Requests a second and error rate | How much one instance can take before it breaks |
| MongoDB queries and time per request | Finds N+1 patterns: a query count that grows with the data |
| Slowest MongoDB commands | Shows what to index or cache first |
| Cache hit ratio, per cache | Shows whether each cache is doing anything |
| Event-loop lag | Node-specific: CPU-heavy work (password hashing, XIRR, fund stats) blocks every request |
| CPU, memory, garbage collection | Leaks and limits |
| Job durations | How NAV import and SIP generation scale with ~14,000 schemes |

### How it works

- **In the app** (`server/src/lib/metrics.ts`): each request, database command, cache lookup and job is recorded twice:
  - as JSON at `/internal/metrics`, which can be reset before each test run;
  - in Prometheus format at `/internal/metrics/prometheus`, using `prom-client`, along with Node's built-in process metrics.
- **Database queries are counted per request** using `AsyncLocalStorage` and the MongoDB driver's command events, so the numbers are exact without any changes to the queries.
- Both endpoints are protected by `CRON_SECRET`.

### Load testing

[k6](https://k6.io) runs in Docker, so nothing is installed in the project. `npm run db:seed:load` creates the test data: 50 users with 10 funds and 3 years of transactions each, on synthetic funds with 6 years of NAVs, so no external APIs are called.

| Scenario | What it shows |
|---|---|
| `health` | The baseline: the framework plus one database ping |
| `login` | Password hashing (argon2) is CPU-bound; watch event-loop lag |
| `dashboard` | The heaviest common page, with a cold and a warm cache |
| `holdings` | The portfolio list and a fund page |
| `compare` | Three funds' full NAV history and ratios |
| `mixed` | A realistic mix, raised step by step to find one instance's limit |

The scenarios use an **open model** (k6's `constant-arrival-rate`). Requests keep arriving at the set rate even when the server slows down, so slowness shows up as latency instead of quietly reducing the load.

### Live dashboard

`npm run grafana:up` starts Prometheus and Grafana in Docker. Open **http://localhost:3001** for the ready-made *Hisaab load test* dashboard, which refreshes every 5 seconds:

- **overview:** requests a second, p95, 5xx rate, event-loop lag;
- **k6:** what the client sees;
- **routes:** latency and traffic per route;
- **MongoDB:** queries per request and the slowest commands;
- **cache:** hit ratio per cache, and whether Redis or MongoDB served it;
- **Node process:** event-loop lag, CPU, memory, GC;
- **Redis:** calls a second and p95 per operation, and fallbacks to MongoDB.

### Try it

Point `MONGODB_URI` at a separate database (e.g. `/hisaab_load`) and set `CRON_SECRET`. Stop `npm run dev` first, because the load server also uses port 3000.

```bash
npm run grafana:up            # Prometheus :9090 + Grafana :3001
npm run db:seed:load          # test users, funds and transactions
npm run load:server           # terminal 1: the built server
npm run load -- mixed         # terminal 2: watch http://localhost:3001
```

Add `REDIS_URL` to `.env` (and `npm run redis:up`) to run the same test with Redis. Each run also saves k6's summary and the server's metrics to `server/load/results/`. All the options are in [`server/load/README.md`](server/load/README.md).

### Results

Measured against MongoDB Atlas's free tier (M0), with 50 test users and a realistic `mixed` load. "Dropped" counts requests k6 couldn't start on time because the server had fallen behind.

**MongoDB only: where one instance breaks.**

| Rate (req/s) | p50 | p95 | Dropped | Errors |
|---|---|---|---|---|
| 5 | 454 ms | 688 ms | 0 | 0% |
| 10 | 590 ms | **4.2 s** | 35 | 0% |
| 15 | 2.3 s | 5.8 s | 50 | 0% |
| 20 | 4.2 s | 9.1 s | 243 | 0% |

The limit was between 5 and 10 requests a second. CPU and the event loop stayed healthy, so the bottleneck was the database: even a cache hit was a round trip to Atlas.

**With Redis, at 10 requests a second:**

| | MongoDB only | With Redis |
|---|---|---|
| p50 | 590 ms | **254 ms** |
| p95 | 4.2 s | **571 ms** |
| Dropped | 35 | 2 |
| Errors | 0% | 0% |

**What each Redis step removed** (database operation counts, which are steadier than latency):

| Step | Before | After |
|---|---|---|
| Cache | Every cache hit was an Atlas query | Cache hits never touch Atlas |
| Rate limits | 6 Atlas operations per login | 4 |
| User lookup | 7.25 Atlas operations per request (`find users` on every request) | 6.25 (`find users` on 4% of requests) |

These are single runs on a shared free-tier cluster, so latencies vary between runs. The last Redis step repeats them and finds the new limit.

## Redis

Redis is an in-memory store, so reading from it takes about a millisecond on the local network. Hisaab uses it for the small, hot data that was costing an Atlas round trip on every request. It's **optional**: with `REDIS_URL` unset, everything runs on MongoDB exactly as before, so simple shared hosting still works.

### What's in Redis

| What | Why Redis | Redis technique | If Redis is down |
|---|---|---|---|
| **Cache** (portfolio history, fund stats, comparisons, AI answers) | Hits are read on most page loads | `SET … PX` with a JSON value; `SCAN` (never `KEYS`) to delete by prefix | Each call falls back to MongoDB |
| **Rate limits** (login, AI, password reset…) | A counter is written on every limited request | `INCR` + `PEXPIRE … NX` + `PTTL` in one `MULTI`; a Lua script to take a hit back | Falls back to MongoDB; limits are briefly looser, but nobody is locked out |
| **Job lock** (NAV import, SIP generation) | Stops two runs overlapping | `SET … NX PX` with a random owner; a Lua compare-and-delete to release | **The job is skipped** (503) and the next cron call retries. A MongoDB fallback could let two runs overlap |
| **Logged-in user** (loaded on every request) | Read on every API request | A 60-second copy as EJSON; cleared by hooks on the User model whenever a user changes | Falls back to MongoDB |

All keys start with `hisaab:` and every key expires, so Redis can always free memory.

### Why sessions stay in MongoDB

Session reads were about 14% of Atlas time, so moving sessions to Redis looked tempting. But a cache can be rebuilt and a session can't: it's the only copy of a login. If sessions lived in Redis, an outage, a restart (this Redis has no persistence) or memory pressure (it evicts expiring keys) would log people out. That breaks the rule that "Redis down means slower, never broken". So sessions stay in MongoDB, and the user document each request loads is cached instead. It saves about as much, and it can always fall back.

### Design rules

- **Optional, behind the existing code.** Redis sits behind `cache.ts`, `rateLimitStore.ts`, `jobLock.ts` and `userCache.ts`, so the routes that use them didn't change.
- **Fails fast.** Commands time out after 500 ms and don't queue while disconnected, so a Redis problem can never stall a request. The client reconnects by itself.
- **Fall back where it's safe, fail closed where it isn't.** The cache, rate limits and user lookup fall back to MongoDB. The job lock refuses to run instead, because correctness matters more than one skipped run.
- **Our own stores**, not ready-made packages (`rate-limit-redis`, `connect-redis`), so each Redis pattern is written and understood.
- **Same tests, both stores.** Each store has one test suite that runs against MongoDB and, when `REDIS_URL` is set, against Redis.
- **Visible.** `/api/health` reports `"redis": "up" | "down" | "disabled"` (it stays 200 when Redis is down), and every Redis call and fallback shows on the Grafana dashboard.

### Progress

| Step | What | Status |
|---|---|---|
| R1 | Connection, health check, Docker Compose, metrics | ✅ Done |
| R2 | Cache | ✅ Done |
| R3 | Rate limits | ✅ Done |
| R4 | Job lock | ✅ Done |
| R5 | Sessions: measured, kept in MongoDB; user lookup cached instead | ✅ Done |
| R6 | Repeat the measurements and find the new limit | In progress |

### Try it

```bash
npm run redis:up                                  # Redis 7 in Docker on localhost:6379
echo "REDIS_URL=redis://localhost:6379" >> .env   # then restart npm run dev
npm run redis:cli                                 # look inside: KEYS hisaab:* (fine locally)
```

Development and tests use Docker (`redis:7-alpine`). In production, a hosted Redis such as Upstash works through the same `REDIS_URL`.

## Tech stack

| Layer | Tools |
|---|---|
| Client | React, React Router, TanStack Query, Tailwind CSS, shadcn/ui (Radix), Recharts, Motion, Font Awesome |
| Server | Node.js 24, Express 5, Mongoose, Zod, decimal.js, argon2, pino, express-session with connect-mongo |
| Database | MongoDB (Atlas); Redis (optional, through `ioredis`) for the cache, rate limits, job lock and user lookup |
| AI | Groq, with Gemini embeddings for the RAG work |
| Shared | `@hisaab/shared`: types, money and date helpers used by both sides |
| Monitoring | prom-client, Prometheus, Grafana, k6, Docker Compose |
| Tooling | TypeScript, Vite, Vitest, Supertest, mongodb-memory-server, Vite+ (lint and format), GitHub Actions |

### Project layout

```
.
├── client/         React app (Vite)
├── server/
│   ├── src/        Express API, jobs and CLI scripts
│   ├── rag/        Fund document manifest and test questions
│   ├── load/       k6 scenarios, Prometheus and Grafana setup
│   └── test/       API, maths and job tests
├── shared/         Types and helpers shared by client and server
└── PLAN.md         Project plan, decisions and phases
```

It's an npm workspaces monorepo, so run every command from the repository root.

## Getting started

### Requirements

- Node.js **24** or newer
- A MongoDB database. A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works. It needs to be a replica set, because writes use transactions, and Atlas clusters are.

### Setup

```bash
git clone https://github.com/Labib000/ai-mutualfund-analyzer-mern.git
cd ai-mutualfund-analyzer-mern
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | What it's for |
|---|---|
| `MONGODB_URI` | Your MongoDB connection string, with the database name (e.g. `/hisaab`) |
| `SESSION_SECRET` | At least 32 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | Optional. Enables the `/internal/jobs/*` endpoints for scheduled jobs and the `/internal/metrics` endpoints |
| `MAIL_*` | Optional locally: without SMTP details, emails are written to `logs/mail.log` |
| `AI_API_KEY` | Optional. A free [Groq API key](https://console.groq.com/keys) for the AI features; without one they say the AI is unavailable. The other `AI_*` settings have working defaults (see `.env.example`) |
| `GEMINI_API_KEY` | Optional, and not used yet. A [Gemini API key](https://aistudio.google.com/apikey) for the RAG work |
| `REDIS_URL` | Optional. `redis://localhost:6379` locally (`npm run redis:up`), or `rediss://…` from Upstash. Turns on Redis for the cache, rate limits, job locks and the logged-in user (see [Redis](#redis)) |
| `COMPARE_RISK_FREE_RATE` | Optional. The yearly risk-free rate (%) for Sharpe and Sortino on the compare page; defaults to 6.5 |

### Load fund data and a demo user

```bash
npm run job:nav-import   # import today's NAVs for every scheme from AMFI (takes a minute)
npm run db:seed          # create a verified demo user: test@example.com / password
```

### Run it

```bash
npm run dev
```

This starts the API on http://localhost:3000 and the app on **http://localhost:5173**. Sign in with the demo user, or register a new account (the verification link is in `logs/mail.log`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run shared, server and client in watch mode |
| `npm run build` | Build shared, client and server for production |
| `npm start` | Start the production server (serves the built client) |
| `npm test` | Run the server and client test suites |
| `npm run typecheck` | Type-check every workspace |
| `npm run check` / `check:fix` | Lint and format check (and fix) |
| `npm run db:seed` | Create or reset the demo user (development only) |
| `npm run job:nav-import` | Import the latest AMFI NAVs. `-- --file=NAVAll.txt` imports from a local file |
| `npm run job:sips-generate` | Record due SIP installments |
| `npm run db:seed:load` | Create load-test users, funds and transactions. `-- --reset` removes them, `-- --clear-cache` empties the cache |
| `npm run load:server` | Build and start the server for load testing (quieter logs) |
| `npm run load -- <scenario>` | Run a k6 scenario in Docker and save the results |
| `npm run grafana:up` / `grafana:down` | Start or stop Prometheus and Grafana |
| `npm run redis:up` / `redis:down` | Start or stop the local Redis in Docker |
| `npm run redis:cli` | Open `redis-cli` inside the local Redis |
| `npm run rag:check` | Validate the fund document list and test questions |
| `npm run rag:extract` | Extract text from the fund PDFs to `server/rag/docs/text/` for review |

The PDFs aren't in the repository. The URLs are listed in `server/rag/manifest.json`, and the files go in `server/rag/docs/`.

## Scheduled jobs

The app runs no background workers, so it suits simple Node hosting. NAV import and SIP generation are HTTP endpoints protected by `CRON_SECRET`, meant to be called by a scheduler (e.g. hPanel cron) once a day after AMFI publishes NAVs:

```bash
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" https://your-app.example/internal/jobs/nav-import
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" https://your-app.example/internal/jobs/sips-generate
```

A lock stops two runs of the same job from overlapping: a second call gets `409`. The lock lives in Redis when `REDIS_URL` is set, otherwise in MongoDB. If Redis is set but unreachable, the job is skipped with `503` and the next scheduled call runs it. The CLI versions (`npm run job:…`) use the same lock.

## Testing

```bash
npm test
```

Server tests run against an in-memory MongoDB replica set, so they need no setup. They cover the API, the portfolio maths and the jobs, and several check figures against the original Laravel app to make sure both give the same numbers. Redis test cases run only when `REDIS_URL` is set: `npm run redis:up`, then `REDIS_URL=redis://localhost:6379 npm test`. CI runs them with a Redis service. The metrics endpoints have their own tests. Load tests are separate and run by hand (see [Scaling and monitoring](#scaling-and-monitoring)). GitHub Actions runs lint, type checks, tests and the build on every push to `main` and every pull request.

## Roadmap

- [x] **Phase 0:** setup
- [x] **Phase 1:** auth and layout
- [x] **Phase 2:** core tracker: NAV import, holdings, transactions, SIPs, dashboard
- [x] **Phase 3:** insights, fund facts (1/3/5-year returns, volatility, drawdown), period changes, financial-year gains
- [x] **Phase 4:** AI: ask questions about your portfolio, summaries, fund explanations
- [ ] **Phase 4.4:** optional Redis layer, almost done
  - [x] monitoring and load-testing tooling (metrics, k6, Prometheus, Grafana)
  - [x] MongoDB-only baseline
  - [x] Redis cache, rate limits, job lock and user lookup; sessions decided (they stay in MongoDB)
  - [ ] repeat the measurements and find the new limit
- [ ] **Phase 4.5:** fund document answers with citations (RAG), on hold
- [ ] **Phase 5:** Pro plan with Razorpay
- [ ] **Phase 6:** 2FA and passkeys, deployment

## Disclaimer

Hisaab is a personal tracking tool, not investment advice. NAV data comes from AMFI and mfapi.in and may be delayed or incomplete. The SIP calculator's figures are illustrations that assume a constant return; the fund compare page shows past performance, which doesn't predict future returns. AI answers are generated by a language model, may contain mistakes, and are explanations, not advice. Mutual fund investments are subject to market risks.
