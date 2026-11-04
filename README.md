# Hisaab

**Hisaab** (हिसाब, "the accounts") is a mutual fund portfolio tracker for Indian investors. Add the funds you hold, record purchases, redemptions and SIPs, and see what your portfolio is really worth: valued at the latest AMFI NAVs, with FIFO cost, realised and unrealised gains, and XIRR.

It's a MERN (MongoDB, Express, React, Node) rebuild of an earlier Laravel app, written in TypeScript end to end.

> **Status:** the tracker, insights and AI features are done. The paid plan is on the way. See [Roadmap](#roadmap).

## Features

- **Every active scheme:** daily NAVs for ~14,000 schemes are imported from AMFI, with NAV history backfilled from [mfapi.in](https://www.mfapi.in).
- **Fund search:** search by name, fund house or category; fund house logos; shows which funds you already hold.
- **Transactions:** purchases, redemptions (including "redeem all units") and stamp duty, with checks that you never sell more units than you hold.
- **SIPs:** monthly SIPs whose installments are recorded automatically once each day's NAV is published (the next available NAV is used on holidays).
- **Accurate numbers:**
  - money is stored as integer paise and units/NAV as fixed-precision decimals (no floating-point drift);
  - cost uses FIFO, so redemptions sell the oldest units first;
  - XIRR per fund and for the whole portfolio.
- **Dashboard:**
  - current value, invested and gain;
  - a value-over-time chart against money invested;
  - allocation by asset class and category;
  - top holdings.
- **Portfolio page:**
  - filter by asset class, search and sort (value, gain, XIRR, …);
  - each fund's weight in the portfolio and a totals row;
  - the filters and sort are kept in the URL.
- **Fund page:** summary, fund facts (1, 3 and 5-year returns, volatility, largest fall), SIPs, and a paginated transaction history.
- **Insights:** what changed over 7 days, 30 days or this month (new money vs market movement), and plain observations such as one fund or fund house holding most of your money.
- **AI explanations** (via [Groq](https://groq.com)):
  - a plain-language summary of your portfolio;
  - "Explain this" for a period's change, and "Explain this fund" for any fund;
  - an Ask page to ask questions about your own figures.

  The AI only sees computed figures (never your name, email or transactions), explains rather than advises, and each user gets 20 requests a month.
- **SIP calculator:**
  - "I can invest" (future value) and "I want to reach" (monthly SIP needed);
  - step-up, inflation-adjusted value, milestones, a growth chart and a year-by-year table;
  - every scenario can be shared by URL.
- **Fund compare:** up to three funds side by side (any active scheme, held or not):
  - growth of ₹10,000 over 1, 3, 5 years or the longest common period;
  - trailing, calendar-year and rolling returns;
  - volatility, Sharpe and Sortino ratios, and the largest fall with its recovery;
  - what a ₹10,000 monthly SIP would have made;
  - every comparison can be shared by URL.
- **Accounts:** register, email verification, password reset, profile and appearance settings (light/dark/system).
- **Responsive:** built to work from a 360 px phone to a wide desktop.

## Tech stack

| Layer | Tools |
|---|---|
| Client | React, React Router, TanStack Query, Tailwind CSS, shadcn/ui (Radix), Recharts, Motion, Font Awesome |
| Server | Node.js 24, Express 5, Mongoose, Zod, decimal.js, argon2, pino, express-session with connect-mongo |
| Database | MongoDB (Atlas) |
| Shared | `@hisaab/shared`: types, money and date helpers used by both sides |
| Tooling | TypeScript, Vite, Vitest, Supertest, mongodb-memory-server, Vite+ (lint and format) |

## Project layout

```
.
├── client/   React app (Vite)
├── server/   Express API, jobs and CLI scripts
├── shared/   Types and helpers shared by client and server
└── PLAN.md   Project plan, decisions and phases
```

It's an npm workspaces monorepo; run every command from the repository root.

## Getting started

### Requirements

- Node.js **24** or newer
- A MongoDB database. A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works. A replica set is needed because writes use transactions; Atlas clusters are replica sets.

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
| `COMPARE_RISK_FREE_RATE` | Optional. The yearly risk-free rate (%) for Sharpe and Sortino on the compare page; defaults to 6.5 |
| `AI_API_KEY` | Optional. A free [Groq API key](https://console.groq.com/keys) for the AI features; without one they say the AI is unavailable. The other `AI_*` settings have working defaults (see `.env.example`) |

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

Server tests run against an in-memory MongoDB replica set (no setup needed) and cover the API, the portfolio maths and the jobs. Several tests check figures against the original Laravel app to make sure both give the same numbers.

## Roadmap

- [x] **Phase 0:** setup
- [x] **Phase 1:** auth and layout
- [x] **Phase 2:** core tracker: NAV import, holdings, transactions, SIPs, dashboard
- [x] **Phase 3:** insights, fund facts (1/3/5-year returns, volatility, drawdown), period changes, financial-year gains
- [x] **Phase 4:** AI: ask questions about your portfolio, summaries, fund explanations
- [ ] **Phase 5:** Pro plan with Razorpay
- [ ] **Phase 6:** 2FA and passkeys, deployment

## Disclaimer

Hisaab is a personal tracking tool, not investment advice. NAV data comes from AMFI and mfapi.in and may be delayed or incomplete. The SIP calculator's figures are illustrations that assume a constant return; the fund compare page shows past performance, which doesn't predict future returns. AI answers are generated by a language model, may contain mistakes, and are explanations, not advice. Mutual fund investments are subject to market risks.
