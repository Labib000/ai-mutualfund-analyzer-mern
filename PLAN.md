# Hisaab (MERN): Project Plan

A rebuild of Hisaab, the personal mutual fund tracker for Indian investors, on **MongoDB Atlas + Express + React + Node**, all in TypeScript. The Laravel app in `../Hisaab` stays untouched. It's the reference: its rules, tests and UI are the spec, and this project has to match them.

> **Revision 1 (2026-11-03).** First draft.
>
> **Revision 2 (2026-11-03).** Approved: the package list, starting with a fresh database (no data migration), and 2FA and passkeys in the last phase.
>
> **Revision 4 (2026-11-03).** Phase 1 decisions: emails go to `logs/mail.log` when SMTP isn't configured; forgot-password always gives the same answer (no account enumeration, a deliberate change from Laravel); the password-confirmation screen moves to Phase 6 with 2FA. Approved `@types/express-session` and `@types/nodemailer`.
>
> **Revision 9 (2026-11-03).** New tool, not in Laravel: **fund compare** (`/tools/compare`, `GET /api/compare?ids=a,b,c`), up to three funds side by side. Decisions: any active scheme can be compared (its mfapi history is fetched on first use, as when adding a fund); no ratings or "best fund" labels, only the best figure in each row set in bold; metrics are trailing returns (1M to 10Y, since launch), the last five calendar years and this year so far, 1Y and 3Y rolling returns (weekly windows over 5 and 10 years), volatility, Sharpe and Sortino over the last 3 years against `COMPARE_RISK_FREE_RATE` (default 6.5%), the largest fall over the whole history with its recovery date, and a ₹10,000 monthly SIP check over 1, 3 and 5 years; 1Y/3Y/5Y and volatility reuse `fundStats()` so the fund page and compare agree; results cache per scheme (`scheme-compare:<id>`) until a newer NAV. Expense ratio, AUM, exit load, holdings and benchmark data aren't available, so they aren't shown. Known limit: on the free Atlas tier the first compare of a fund nobody has used yet takes 5–20 s, mostly storing its NAV history; the page says so while it loads.

> **Revision 10 (2026-11-04).** New Phase 4.5, not in Laravel: **fund document RAG**, citation-backed answers from fund documents on the Ask page. Decisions: Gemini embeddings behind an `EmbeddingProvider` interface; ingestion is a local CLI only, writing straight to Atlas, so it needs no cron and avoids Hostinger's request timeout; the first scope is KIMs and the latest factsheets for 5–10 fund houses and about 50 funds, with SIDs as a stretch goal; PDFs aren't committed, only a manifest; a rule-based router sends questions to the portfolio path, the document path or both, because `RunAiFeature` counts every successful call and an AI router would charge two requests; hybrid search runs `$vectorSearch` and `$search` separately and merges them with our own Reciprocal Rank Fusion, since `$rankFusion` on M0 is unconfirmed; `SYSTEM` stays unchanged; a document answer counts as one `ask`, while embedding calls and "not found" don't count; personal figures come only from `<portfolio_data>`. Work follows `RAG_STUDY_GUIDE.md`: each milestone starts by studying its topics. To confirm: Gemini's model, dimensions, rate limits and free-tier data terms, and Atlas M0's storage limit (MongoDB's docs confirm 3 search and vector indexes; we use 2).

> **Revision 8 (2026-11-03).** Phase 4 decisions: Groq is called with Node's built-in `fetch` (no SDK, no new packages); the prompts are copied byte for byte from Laravel and pinned by tests; AI errors use the app's `{ message }` body (plus `remaining`) instead of Laravel's `{ error }`, so the client's `ApiError` shows them as they are; the explain endpoint is `POST /api/holdings/:id/explain`; `aiUsage` stores `provider` and `model` and no `cached` flag (cached answers aren't logged, as in Laravel). One deliberate change from Laravel: `fundStats()` now scales NAVs from before a **face-value change** (a one-step jump of 8× or more, e.g. HDFC Liquid Fund's ×100 on 30 Aug 2015) onto today's basis. Without it, mfapi.in's raw NAVs gave that fund "+48.9% a year since 2012", on the fund facts card and in the AI's explanation; the stats cache version gained a `v2|` prefix so old figures are recomputed.
>
> **Revision 7 (2026-11-03).** Phase 3 decisions: `FinancialYears` is ported with tests but no UI, as in Laravel (only the Phase 4 AI context uses it); the change card's "Explain this" button and the insights' suggested AI questions wait for Phase 4 (the questions are kept server-side and not sent, as in Laravel); fund names in sentences use the shared `shortSchemeName()`, which drops only plan and option parts, a deliberate change from Laravel's `shortName()`, which cut "UTI - Nifty Next 50 Index Fund" down to "UTI"; the dashboard's change periods are `{}` (not `[]`) when nothing is valued yet.
>
> **Revision 6 (2026-11-03).** Phase 2c decisions: request fields keep Laravel's snake_case names (`txn_date`, `day_of_month`, …) so 422 keys and messages match, while responses are camelCase; business-rule failures throw a `ValidationError` that the error handler sends as a 422; cascading deletes (holding → SIPs and transactions, SIP → installments) are done by hand inside a Mongo transaction; `holding.version` is bumped first in every unit-checking transaction, so concurrent writes conflict and retry.
>
> **Revision 5 (2026-11-03).** Phase 2a decisions: the AMFI import runs without a Mongo transaction (it touches ~14k schemes and every write is idempotent, so a re-run repairs a partial one); the cron endpoint runs the job inside the request; a `jobLocks` collection stops overlapping runs; `schemes` gains `isinReinvestment`, `schemeType`, `plan` and `historySyncedAt`; new optional env `AMFI_NAV_URL`, `AMFI_TIMEOUT_SECONDS`, `MFAPI_BASE_URL`, `MFAPI_TIMEOUT_SECONDS`.
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
- **schemes**: `amfiCode` (unique), `isinGrowth` (index), `isinReinvestment`, `name` (text index for search), `amc`, `schemeType`, `category`, `plan`, `isActive` (index), `latestNav`, `latestNavDate`, `historySyncedAt` (set once the scheme's full NAV history is stored).
- **navHistory**: `schemeId`, `navDate`, `nav`. Unique on (`schemeId`, `navDate`). Only for schemes someone holds.
- **holdings**: `userId`, `schemeId`. Unique on (`userId`, `schemeId`).
- **sips**: `holdingId`, `userId`, `amountPaise`, `dayOfMonth`, `startDate`, `endDate?`, `generatedUntil?`.
- **transactions**: `holdingId`, `userId`, `sipId?`, `type` (`purchase` | `sip_installment` | `redemption`), `txnDate`, `navDate`, `amountPaise`, `stampDutyPaise`, `nav`, `units`, `unitsOverridden`, `createdAt`.
  - Index on (`holdingId`, `txnDate`).
  - Unique partial index on (`sipId`, `txnDate`) where `sipId` exists, so an installment can't be recorded twice.
- **aiUsage**: `userId`, `feature`, `provider`, `model`, `inputTokens`, `outputTokens`, `succeeded`, `createdAt`. One row per call to the provider; cached answers aren't logged.
- **cache**: `key` (unique), `value`, `expiresAt` (TTL index). This replaces Laravel's cache for the value history, AI summary, fund explanations and scheme stats. Version-hash keys work the same way as now.
- **jobLocks**: `key` (unique), `owner`, `expiresAt` (TTL index). Stops two cron calls running the same job at once (Laravel's `withoutOverlapping`).
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
- *Deferred to Phase 6 (decided):* 2FA (TOTP), passkeys (`@simplewebauthn`) and the password-confirmation screen. Their packages need approval when we get there.
- Without `MAIL_*` set, emails are written to `logs/mail.log` (click the links from there).
- Forgot-password answers the same whether or not the email is registered.
- **Done when:** the auth flows have Supertest coverage and protected routes redirect correctly.

### Phase 2: Core tracker (port of Laravel Phase 1)
- **2a. Schemes and NAVs:**
  - port `AmfiNavFileParser` and `NavImporter` (bulk upserts), `NavLookup`, and `MfApiNavProvider` with a `FakeNavProvider` for tests;
  - add a `POST /internal/jobs/nav-import` endpoint guarded by `CRON_SECRET`, plus an `npm run job:nav-import` CLI for local use.
  - *Done (2026-11-03):* all of the above, plus the `Decimal` and date-string helpers. The import is not wrapped in a transaction (see Revision 5).
- **2b. Calculations:** port `UnitCalculator`, `UnitLedger`, `FifoLots`, `Xirr`, `SipSchedule` and `PerformanceCalculator`, with their unit tests.
  - *Done (2026-11-03):* in `server/src/portfolio/`, plus `Money` (in `shared`, so the client can format ₹) and bcmath-style truncating `Decimal.add/sub/mul/div`. Dates are `"YYYY-MM-DD"` strings throughout; `Performance.toJSON()` uses camelCase keys (`PerformanceJson` in `shared`).
- **2c. Portfolio entry:**
  - scheme search, holdings, purchases, redemptions and SIPs (create, edit, stop, delete), with all the business rules;
  - an ownership middleware (`loadHolding`) that also scopes child ids to the holding;
  - SIP generation as a job and endpoint, like nav-import.
  - *Done (2026-11-03):* API under `/api/schemes` and `/api/holdings` (actions in `server/src/portfolio/actions/`), `POST /internal/jobs/sips-generate` + `npm run job:sips-generate`, and the Portfolio, Add fund and fund pages. AI explain came in Phase 4.
- **2d. Dashboard:**
  - `PortfolioPerformance` with the version-hashed value-history cache, and allocation;
  - port the dashboard UI: `PortfolioSummary`, holdings table, value chart with ranges, allocation charts.
  - *Done (2026-11-03):* `GET /api/dashboard` (summary, weekly history, allocation, top 5 funds), the `cache` collection with `cacheGet`/`cachePut` (one `portfolio-history:<userId>` entry, replaced when the md5 of each fund's latest NAV date, transaction count, newest id and newest `updatedAt` changes), and the dashboard page. Recharts sits in its own `charts` chunk, which only the dashboard loads. The change card and insights came in Phase 3; the AI summary came in Phase 4. **Phase 2 is complete.**
- **Done when:** a user can add funds and SIPs, the numbers match the Laravel app for the same data, and the ported tests pass.

### Phase 3: Insights and fund facts (port of 2b-A to 2b-C)
- `FundStats`/`SchemeStats`, `Insights`, `PortfolioChange`, and `FinancialYears`, with tests and the dashboard cards.
- *Done (2026-11-03):*
  - **3a. Fund facts:** `fundStats()` (1Y, 3Y and 5Y CAGR, since start, weekly volatility, max drawdown) and `schemeStats()`, cached per scheme as `scheme-stats:<schemeId>` and versioned by `latestNavDate|historySyncedAt`. `GET /api/holdings/:id` returns `fundStats`, and the Fund facts card is on the fund page.
  - **3b. What changed:** `changeOver()` and `portfolioChanges()` for 7D / 30D / this month (new money vs market movement, best and worst fund, SIP installments). Shown on the dashboard.
  - **3c. Insights:** `insightsOf()` and `portfolioInsights()`, with the same rules, thresholds and wording as Laravel. The Insights card sits beside the change card on the dashboard.
  - **3d. Financial years:** `financialYears()`, server only.
  - Laravel's unit tests for all four are ported with the same fixtures and expected figures. **Phase 3 is complete.**

### Phase 4: AI (port of Phase 2)
- `AiProvider`, `GroqProvider`, `FakeAiProvider`, `RunAiFeature`, `AiQuota` (20 a month on the IST calendar month, 5 a minute; failed and cached calls don't count), and `PortfolioContext`, including the test that keeps a 20-fund context under 13K characters.
- Summary, ask, digest and explain endpoints with caching; the Ask page; disclaimers everywhere.
- *Done (2026-11-03):*
  - **4a. Foundation:** typed `AI_*` settings with Laravel's defaults, `GroqProvider` (OpenAI-style chat completions, `reasoning_effort: low` without reasoning text, no retries), `AiQuota`, `RunAiFeature` (logs every call, failed ones too), the prompts, and the `aiUsage` collection. `createApp` takes an `aiProvider`; tests use `FakeAiProvider`.
  - **4b. What the AI sees:** `renderContext()`/`contextFor()` (totals, allocation, each fund with its fund facts line and running SIPs, cash flow by financial year, the last 30 days' change, and the insights as observations), `changeText()`, `fundFactsFull()`/`fundFactsShort()` and `suggestedQuestions()`.
  - **4c. Endpoints:** `GET /api/ai/ask`, `POST /api/ai/summary` (cached a day, versioned by the history version, the SIPs and the model; `fresh` regenerates), `POST /api/ai/ask` (last 6 turns from the browser), `POST /api/ai/digest` (cached per period) and `POST /api/holdings/:id/explain` (cached 30 days per scheme, shared by every user). 5 a minute per user; 429 when the month is used up, 503 when the AI is busy, 422 with nothing to explain.
  - **4d. UI:** the AI summary card on the dashboard, "Explain this" on the What changed card, "Explain this fund" on the fund page, and the Ask page, laid out like a chat assistant (the input starts mid-screen with suggestions and moves to the bottom once a chat starts; a round send button; answers revealed word by word, off under reduced motion; copy and retry on answers; New chat; components in `client/src/components/ai/chat/`). Answers render as plain paragraphs and lists (markdown markers the model adds anyway are dropped), each with the not-advice disclaimer and the requests left.
  - Laravel's `GroqProviderTest`, `AiPromptsTest`, `PortfolioContextTest`, `SuggestedQuestionsTest` and `AiFeaturesTest` are ported. **Phase 4 is complete.**

### Tools (outside the phases)

- SIP calculator (Phase 2).
- Fund compare (Revision 9): the maths in `server/src/portfolio/fundCompare.ts`, the endpoint in `server/src/routes/compare.ts`, the page in `client/src/pages/tools/compare.tsx`; also linked from each fund page.

### Phase 4.5: Fund document RAG

Citation-backed answers from fund documents on the Ask page. See Revision 10 for the decisions and `RAG_STUDY_GUIDE.md` for the concepts. Each milestone starts by studying its topics, and the next one starts when the user is ready.

- **M0, foundations:** the study guide and this plan update.
- **M1, documents and questions:** collect documents, write `server/rag/manifest.json`, and hand-write 60 evaluation questions (40 for tuning, 20 held back). *Done when:* the questions cover facts, tables, not-found cases and portfolio questions.
  - *Prep done (2026-11-04):* 12 documents from 5 fund houses covering 50 funds are in `server/rag/manifest.json`. Factsheets list per-fund page ranges under `sections`; PDFs are kept locally in `server/rag/docs/` (gitignored). HDFC, SBI, ICICI, Kotak, DSP and Mirae pages couldn't be scripted, so newer KIMs may need a manual browser download. The questions are still to write.
- **M2, ingestion:** PDF text, chunking, embeddings and storage in the new `fundDocuments` and `docChunks` collections, through `npm run rag:ingest`. *Done when:* all documents are ingested and a re-run does no new work.
- **M3, vector search:** `$vectorSearch` filtered to the fund, and `npm run rag:eval`. *Done when:* the first baseline is in `server/rag/eval/results.md`.
- **M4, better retrieval:** keyword search, Reciprocal Rank Fusion and table-aware chunking, each measured. *Done when:* before and after scores are recorded and failures reviewed.
- **M5, answers:** router, fund detection, answer prompt, citation checks and "not found". *Done when:* Ask returns cited answers and portfolio questions behave as before.
- **M6, safety and UI:** the sources list, injection and no-advice tests, and the keyword-only fallback when Gemini fails. *Done when:* the safety tests pass and it works at 360 px.
- **M7, final run:** score the held-back questions, update the README and write interview notes. *Done when:* final scores are recorded and CI is green.

Needs approval: one PDF text extractor for the local CLI (`pdfjs-dist` unless real PDFs point elsewhere). `mongodb-memory-server` can't be assumed to run Atlas search stages, so unit tests use fakes and `rag:eval` checks the real indexes.

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
