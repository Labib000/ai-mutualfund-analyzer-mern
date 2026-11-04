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

> **Status:** the tracker, insights and AI features are done. Fund document answers (RAG) are in progress. See the [roadmap](#roadmap).

## Contents

- [Why Hisaab](#why-hisaab)
- [Features](#features)
- [How it works](#how-it-works)
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
- **It runs on simple hosting.** There are no background workers, Redis or in-process schedulers, so one Node app is enough.

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
       Node app: Express API + the built React client
          |                |                     |
          v                v                     v
    MongoDB Atlas      Groq API      AMFI and mfapi.in (NAV data)
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

### Fund document answers (in progress)

Some questions can't be calculated, such as a fund's exit load or objective. These answers live in fund documents, so this work adds citation-backed RAG to the Ask page:

```
Fund PDFs -> extract text -> chunks -> embeddings (Gemini) -> MongoDB Atlas

Question -> router -> portfolio figures (exact, unchanged)
                   -> document search -> Groq answers with citations
```

Personal figures will always come from the app's calculations, never from retrieved text.

**Done so far:** the document list and its validation, PDF text extraction, and the database models. Search and answers aren't built yet, so the Ask page doesn't use documents today.

## Tech stack

| Layer | Tools |
|---|---|
| Client | React, React Router, TanStack Query, Tailwind CSS, shadcn/ui (Radix), Recharts, Motion, Font Awesome |
| Server | Node.js 24, Express 5, Mongoose, Zod, decimal.js, argon2, pino, express-session with connect-mongo |
| Database | MongoDB (Atlas) |
| AI | Groq, with Gemini embeddings for the RAG work |
| Shared | `@hisaab/shared`: types, money and date helpers used by both sides |
| Tooling | TypeScript, Vite, Vitest, Supertest, mongodb-memory-server, Vite+ (lint and format), GitHub Actions |

### Project layout

```
.
├── client/         React app (Vite)
├── server/
│   ├── src/        Express API, jobs and CLI scripts
│   ├── rag/        Fund document manifest and test questions
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
| `CRON_SECRET` | Optional. Enables the `/internal/jobs/*` endpoints for scheduled jobs |
| `MAIL_*` | Optional locally: without SMTP details, emails are written to `logs/mail.log` |
| `AI_API_KEY` | Optional. A free [Groq API key](https://console.groq.com/keys) for the AI features; without one they say the AI is unavailable. The other `AI_*` settings have working defaults (see `.env.example`) |
| `GEMINI_API_KEY` | Optional, and not used yet. A [Gemini API key](https://aistudio.google.com/apikey) for the RAG work |
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
| `npm run rag:check` | Validate the fund document list and test questions |
| `npm run rag:extract` | Extract text from the fund PDFs to `server/rag/docs/text/` for review |

The PDFs aren't in the repository. The URLs are listed in `server/rag/manifest.json`, and the files go in `server/rag/docs/`.

## Scheduled jobs

The app runs no background workers, so it suits simple Node hosting. NAV import and SIP generation are HTTP endpoints protected by `CRON_SECRET`, meant to be called by a scheduler (e.g. hPanel cron) once a day after AMFI publishes NAVs:

```bash
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" https://your-app.example/internal/jobs/nav-import
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" https://your-app.example/internal/jobs/sips-generate
```

A lock in the database stops two runs of the same job from overlapping.

## Testing

```bash
npm test
```

Server tests run against an in-memory MongoDB replica set, so they need no setup. They cover the API, the portfolio maths and the jobs, and several check figures against the original Laravel app to make sure both give the same numbers. GitHub Actions runs lint, type checks, tests and the build on every push to `main` and every pull request.

## Roadmap

- [x] **Phase 0:** setup
- [x] **Phase 1:** auth and layout
- [x] **Phase 2:** core tracker: NAV import, holdings, transactions, SIPs, dashboard
- [x] **Phase 3:** insights, fund facts (1/3/5-year returns, volatility, drawdown), period changes, financial-year gains
- [x] **Phase 4:** AI: ask questions about your portfolio, summaries, fund explanations
- [ ] **Phase 4.5:** fund document answers with citations (RAG), in progress
- [ ] **Phase 5:** Pro plan with Razorpay
- [ ] **Phase 6:** 2FA and passkeys, deployment

## Disclaimer

Hisaab is a personal tracking tool, not investment advice. NAV data comes from AMFI and mfapi.in and may be delayed or incomplete. The SIP calculator's figures are illustrations that assume a constant return; the fund compare page shows past performance, which doesn't predict future returns. AI answers are generated by a language model, may contain mistakes, and are explanations, not advice. Mutual fund investments are subject to market risks.
