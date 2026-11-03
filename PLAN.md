# Hisaab (MERN): Project Plan

A rebuild of Hisaab, the personal mutual fund tracker for Indian investors, on **MongoDB Atlas + Express + React + Node**, all in TypeScript. The Laravel app in `../Hisaab` stays untouched. It's the reference: its rules, tests and UI are the spec, and this project has to match them.

> **Revision 1 (2026-11-03).** First draft.
>
> **Revision 2 (2026-11-03).** Approved: the package list, starting with a fresh database (no data migration), and 2FA and passkeys in the last phase.
>
> **Revision 3 (2026-11-03).** Phase 0 runs on localhost only; the Hostinger check moves to Phase 6. Kept `vite-plus` for lint and format. Approved the Phase 0 tooling and UI packages (below).

---

## Working agreement

- **Discuss before coding.** At the start of each phase, propose the approach (files, collections, modules, trade-offs) and wait for approval.
- Work one phase at a time. Don't start the next phase until the current one meets its "done when" criteria.
- Ask before adding any npm package this plan doesn't list.
- **Parity first.** Port the Laravel tests for calculations and business rules alongside the code. A ported module is done when it passes the same cases as the PHP version.
- Keep commits small. No Claude attribution in commits or PRs.
- If something in this plan is wrong or unclear, say so instead of working around it.

---

## Constraints

- **Hosting: Hostinger Business shared hosting, as a Node.js Web App** (Node 22 or 24). One Node app, so the API and the built React client deploy together: Express serves `client/dist`.
- **Database: MongoDB Atlas.** Hostinger shared hosting can't run MongoDB. Use the free M0 tier at first, in the region nearest the Hostinger server (Mumbai `ap-south-1` if the server is in India).
- **No long-running extras:** no Redis, no workers, no in-process schedulers (`node-cron`). Hostinger can restart or idle the app. Scheduled work runs from **hPanel cron**, which calls secret-protected HTTP endpoints (see Phase 2a).
- **Money is integer paise.** Fields end in `Paise` and are stored as integer `Number`s; ₹ amounts stay well under 2^53.
- **NAVs and units are exact decimals.**
  - They're stored as normalised strings: NAV has 4 dp (`"123.4560"`) and units have 3 dp (`"10.250"`).
  - All arithmetic goes through `decimal.js`, wrapped in a small `Decimal` helper. Nothing is ever converted to a JS `number`, except derived *rates* (XIRR, CAGR, volatility), as in the Laravel version.
- **Dates are IST calendar dates**, stored as `"YYYY-MM-DD"` strings rather than `Date` objects. That avoids UTC drift and still sorts correctly. "Today" comes from one `today()` helper fixed to Asia/Kolkata, which tests can freeze. Timestamps (`createdAt`) stay as `Date`.
- **No investment advice.** AI output explains, never recommends buying, selling or switching, and always shows a disclaimer.

---

## Tech stack

| Layer | Choice |
|---|---|
| Repo | One repo using npm workspaces: `client/`, `server/`, `shared/` (types + Zod schemas used by both) |
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query |
| UI | shadcn/Radix (copied over from the Laravel app), Recharts, `motion`, Font Awesome, `sonner` |
| Backend | Node 24, Express 5, TypeScript (built with `tsc`, run as plain JS in production) |
| Database | MongoDB Atlas through Mongoose |
| Validation | Zod (shared between client forms and server routes) |
| Auth | Server sessions in an httpOnly cookie, stored in Mongo (`express-session` + `connect-mongo`); passwords hashed with `argon2` |
| Email | `nodemailer` over Hostinger SMTP (verification, password reset) |
| Decimals | `decimal.js` |
| Security | `helmet`, `express-rate-limit` (state kept in Mongo, because the app may restart) |
| Tests | Vitest + Supertest; `mongodb-memory-server` in replica-set mode, so Mongo transactions work in tests |
| Lint/format | `vite-plus` (`vp check`: oxlint + oxfmt), same settings as the Laravel app |
| AI | `AiProvider` interface, `GroqProvider` using `fetch` (no SDK); `ClaudeProvider` later |
| Payments | Razorpay Node SDK (Phase 5) |

**Why cookie sessions rather than JWT:** the client and API share one origin, so a session cookie is simpler. Logout and revocation work out of the box, and nothing sensitive sits in `localStorage`. CSRF is covered by `SameSite=Lax` plus an `Origin` check on writes.

**Approved packages (2026-11-03):**
- client: `react-router`, `@tanstack/react-query`, `zod`
- server: `express`, `mongoose`, `zod`, `decimal.js`, `express-session`, `connect-mongo`, `argon2`, `nodemailer`, `helmet`, `express-rate-limit`, `pino`
- dev: `vitest`, `supertest`, `mongodb-memory-server`, `tsx`

**Approved for Phase 0 (2026-11-03):**
- tooling: `typescript` (5.x), `vite`, `vite-plus`, `@vitejs/plugin-react`, `@rolldown/plugin-babel`, `babel-plugin-react-compiler`, `@tailwindcss/vite`, `tailwindcss`, `tw-animate-css`, `concurrently`
- types: `@types/node`, `@types/express`, `@types/supertest`, `@types/react`, `@types/react-dom`
- UI used by the copied components: the Radix packages, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `input-otp`, `motion`, Font Awesome

Everything else (shadcn/Radix, Recharts, motion, Font Awesome, sonner, Tailwind) is already in the Laravel app.

---

## Project layout

```
Hisaab-mern/
  package.json            # workspaces; build = shared → client → server; start = node server/dist/index.js
  shared/src/             # Zod schemas, API types, enums (TransactionType, AiFeature, …)
  client/
    src/
      pages/              # same pages as resources/js/pages
      components/         # app components; components/ui = shadcn
      lib/api.ts          # fetch wrapper (credentials, JSON errors → form errors)
      routes.tsx          # React Router + auth guards
  server/
    src/
      index.ts            # Express app, serves client/dist in production
      config.ts           # env, validated with Zod at boot
      models/             # Mongoose schemas
      portfolio/          # framework-free calculations (port of app/Portfolio)
      nav/                # AMFI parser, importer, NavLookup, MfApiNavProvider
      ai/                 # AiProvider, GroqProvider, RunAiFeature, AiQuota, Prompts, PortfolioContext
      actions/            # one module per write op (addPurchase, addRedemption, createSip, …)
      routes/             # thin Express routers
      middleware/         # auth, ownership (loadHolding), rate limits, error handler
      jobs/               # navImport, sipsGenerate (called by the cron endpoint and the CLI)
    test/
      support/buildsPortfolio.ts   # same fixture as tests/Support/BuildsPortfolio (today = Thu 8 Oct 2026)
      fixtures/amfi/               # copied from the Laravel app
```

---

## Data model (MongoDB collections)

These are separate collections joined by `ObjectId` references. Nothing is embedded where it can grow without bound: a holding's transactions grow forever and need their own unique indexes.

- **users**: `name`, `email` (unique), `passwordHash`, `emailVerifiedAt`, `createdAt`. Later: `twoFactorSecret`, `twoFactorRecoveryCodes`, `passkeys[]`.
- **schemes**: `amfiCode` (unique), `isin`, `name` (text index for search), `amc`, `category`, `isActive`, `latestNav`, `latestNavDate`.
- **navHistory**: `schemeId`, `navDate`, `nav`. Unique on (`schemeId`, `navDate`). Only for schemes someone holds.
- **holdings**: `userId`, `schemeId`. Unique on (`userId`, `schemeId`).
- **sips**: `holdingId`, `userId`, `amountPaise`, `dayOfMonth`, `startDate`, `endDate?`, `generatedUntil?`.
- **transactions**: `holdingId`, `userId`, `sipId?`, `type` (`purchase` | `sip_installment` | `redemption`), `txnDate`, `navDate`, `amountPaise`, `stampDutyPaise`, `nav`, `units`, `unitsOverridden`, `createdAt`.
  - Index on (`holdingId`, `txnDate`).
  - Unique partial index on (`sipId`, `txnDate`) where `sipId` exists, so an installment can't be recorded twice.
- **aiUsage**: `userId`, `feature`, `inputTokens`, `outputTokens`, `succeeded`, `cached`, `createdAt`.
- **cache**: `key` (unique), `value`, `expiresAt` (TTL index). This replaces Laravel's cache for the value history, AI summary, fund explanations and scheme stats. Version-hash keys work the same way as now.
- **sessions**: managed by `connect-mongo`.
- Phase 5 adds `plans`, `userPlans`, `payments`, `paymentEvents` and `webhookEvents`, mirroring PLAN.md in the Laravel app.

`userId` is copied onto sips and transactions so ownership checks and per-user queries need no join.

**Consistency.** These writes run inside a **Mongo transaction** (Atlas M0 supports them):
- a redemption, checked against units held;
- deleting a transaction or SIP, checked against later redemptions overselling;
- SIP generation.

As a guard against two requests racing on the same holding, each write also increments a `version` field on the holding inside the transaction. Of two concurrent writes, one conflicts and retries.

---

## Calculation rules

**These are unchanged.** See "Calculation rules" in `../Hisaab/PLAN.md`:
- next-business-day NAV for transactions, and latest on or before the date for valuation;
- 0.005% stamp duty;
- units rounded to 3 dp, with the override flag;
- redemptions entered in units;
- SIP days 29–31 fall on month end;
- create and delete only, with no edits;
- FIFO cost and realised gain;
- XIRR on Excel's convention, using Newton-Raphson with a bisection fallback;
- XIRR display thresholds (30 days, 1 year).

**Rounding has to match bcmath exactly.** `Decimal::round` in PHP rounds half away from zero, so `decimal.js` is configured with `ROUND_HALF_UP` (which in decimal.js also rounds away from zero) and enough precision. The ported unit tests are the proof.

---

## Phases

### Phase 0: Setup
- Workspaces, TypeScript configs, Vite + Tailwind 4 client and Express server, `npm run dev` running both (Vite proxies `/api` to Express).
- Copy over the brand tokens (`app.css`), fonts (Inter and Poppins, self-hosted), logo assets, favicons and shadcn components, including the customised `dialog.tsx`.
- Connect to Mongo. Zod-validated config, plus a `.env.example` with `MONGODB_URI`, `SESSION_SECRET`, `APP_URL`, `CRON_SECRET`, `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `MAIL_*`.
- Vitest with `mongodb-memory-server`; GitHub Actions running lint, typecheck and tests.
- Runs on **localhost only**; the Hostinger hello-world check moved to Phase 6.
- **Done when:** both apps run locally, a health endpoint reads from Mongo, and CI is green.

### Phase 1: Auth and layout
- Register, log in and log out, email verification, forgot and reset password, and a profile page (name, email, password, delete account).
- Rate limits on login and reset.
- App shell port: sidebar with the sliding pill, mobile sheet, header and theme toggle.
- *Deferred to Phase 6 (decided):* 2FA (TOTP) and passkeys (`@simplewebauthn`). Their packages need approval when we get there.
- **Done when:** the auth flows have Supertest coverage and protected routes redirect correctly.

### Phase 2: Core tracker (port of Laravel Phase 1)
- **2a. Schemes and NAVs:**
  - port `AmfiNavFileParser` and `NavImporter` (bulk upserts), `NavLookup`, and `MfApiNavProvider` with a `FakeNavProvider` for tests;
  - add a `POST /internal/jobs/nav-import` endpoint guarded by `CRON_SECRET`, plus an `npm run job:nav-import` CLI for local use.
- **2b. Calculations:** port `UnitCalculator`, `UnitLedger`, `FifoLots`, `Xirr`, `SipSchedule` and `PerformanceCalculator`, with their unit tests.
- **2c. Portfolio entry:**
  - scheme search, holdings, purchases, redemptions and SIPs (create, edit, stop, delete), with all the business rules;
  - an ownership middleware (`loadHolding`) that also scopes child ids to the holding;
  - SIP generation as a job and endpoint, like nav-import.
- **2d. Dashboard:**
  - `PortfolioPerformance` with the version-hashed value-history cache, and allocation;
  - port the dashboard UI: `PortfolioSummary`, holdings table, value chart with ranges, allocation charts.
- **Done when:** a user can add funds and SIPs, the numbers match the Laravel app for the same data, and the ported tests pass.

### Phase 3: Insights and fund facts (port of 2b-A to 2b-C)
- `FundStats`/`SchemeStats`, `Insights`, `PortfolioChange`, and `FinancialYears`, with tests and the dashboard cards.

### Phase 4: AI (port of Phase 2)
- `AiProvider`, `GroqProvider`, `FakeAiProvider`, `RunAiFeature`, `AiQuota` (20 a month on the IST calendar month, 5 a minute; failed and cached calls don't count), and `PortfolioContext`, including the test that keeps a 20-fund context under 13K characters.
- Summary, ask, digest and explain endpoints with caching; the Ask page; disclaimers everywhere.

### Phase 5: Razorpay Pro plan
- As in Phase 3 of the Laravel plan: orders, a signature-verified callback, an idempotent webhook as the source of truth (activation inside a Mongo transaction), plan expiry and limits.

### Phase 6: Polish and deploy
- 2FA and passkeys, empty and error states, a security pass, and the README.
- **First**, a hello-world deploy to answer open question 1 (workspaces build, request timeout).
- **Deploy to Hostinger:**
  - create a Node.js Web App in hPanel, connected to the GitHub repo (or a zip upload);
  - build command `npm ci && npm run build`, start command `npm start`, Node 24;
  - set the environment variables in hPanel;
  - allowlist the Hostinger server IP in Atlas network access;
  - add hPanel cron entries for the job endpoints.

**Cron schedule.** Each entry runs `curl -fsS -X POST -H "X-Cron-Secret: …" https://…/internal/jobs/<job>` at the same IST times as `routes/console.php`:

| Job | Times (IST) |
|---|---|
| `nav-import` | 08:00 and 23:30 |
| `sips-generate` | 08:00 and 23:45 |

hPanel cron may run on server time, so convert the times if it does.

---

## Open questions

1. **Hostinger build:** does the Node.js Web App run an npm workspaces build, and what is its request timeout? A NAV import has to finish within one request. Check this at the start of Phase 6 with a hello-world deploy (deferred from Phase 0).
2. ~~Data migration~~: start fresh. Nothing is migrated from the Laravel MariaDB.
3. ~~Lint tooling~~: kept `vite-plus` (1.x works across the workspaces).
4. ~~2FA and passkeys~~: deferred to Phase 6.
