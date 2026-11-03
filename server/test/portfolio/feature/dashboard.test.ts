import type { DashboardResponse } from '@hisaab/shared';
import { describe, expect, it } from 'vitest';

import { CacheEntry } from '../../../src/models/cacheEntry.js';
import { Holding } from '../../../src/models/holding.js';
import { Scheme } from '../../../src/models/scheme.js';
import { Transaction } from '../../../src/models/transaction.js';
import { createUser, loginAs, makeTestApp } from '../../support/app.js';
import { useTestDb } from '../../support/db.js';
import { businessDayNavs, usePortfolio } from '../../support/portfolio.js';
import { createScheme } from '../../support/schemes.js';

// Port of tests/Feature/DashboardTest.php. The `changes` and `insights`
// assertions arrive with PortfolioChange and Insights in Phase 3.
describe('dashboard', () => {
    useTestDb();
    const p = usePortfolio();

    async function dashboard(agent = p().agent): Promise<DashboardResponse> {
        const res = await agent.get('/api/dashboard').expect(200);
        return res.body as DashboardResponse;
    }

    /** The performance scenario: a year of ₹5,000 SIP installments, a ₹20,000 lump sum, 100 units redeemed. */
    async function buildPerformanceScenario() {
        const { agent, url } = p();
        await agent
            .post(url('/sips'))
            .send({ amount: '5000', day_of_month: 5, start_date: '2025-10-01' })
            .expect(201);
        await agent
            .post(url('/purchases'))
            .send({ txn_date: '2025-12-15', amount: '20000' })
            .expect(201);
        await agent
            .post(url('/redemptions'))
            .send({ txn_date: '2026-06-10', units: '100' })
            .expect(201);
    }

    it('asks guests to sign in', async () => {
        await makeTestApp().agent().get('/api/dashboard').expect(401);
    });

    it('shows an empty dashboard to a new user', async () => {
        const agent = await loginAs(makeTestApp().agent(), await createUser());

        const body = await dashboard(agent);

        expect(body.fundCount).toBe(0);
        expect(body.history).toEqual([]);
        expect(body.allocation).toEqual({ classes: [], categories: [] });
        expect(body.topHoldings).toEqual([]);
        expect(body.summary.investedPaise).toBe(0);
    });

    it('matches the fund figures', async () => {
        await buildPerformanceScenario();

        const body = await dashboard();

        expect(body.fundCount).toBe(1);
        // The same figures the performance test checks against LibreOffice.
        expect(body.summary.investedPaise).toBe(8380194);
        expect(body.summary.valuePaise).toBe(9108390);
        expect(body.summary.xirrPct).toBe(15.63);
        expect(body.history[0]!.date).toBe('2025-10-05');
        expect(body.history[0]!.investedPaise).toBe(500000);
        expect(body.history.at(-1)).toEqual({
            date: '2026-10-07',
            valuePaise: 9108390,
            investedPaise: 8380194,
        });
        expect(body.allocation.classes[0]!.key).toBe('equity');
        expect(body.allocation.classes[0]!.pct).toBe(100);
        expect(body.allocation.categories[0]!.label).toBe('Flexi Cap Fund');
        expect(body.topHoldings).toHaveLength(1);
        expect(body.topHoldings[0]!.id).toBe(p().holding.id);
    });

    it('spans asset classes in allocation and top holdings', async () => {
        const { agent, url, user, navProvider } = p();
        await agent
            .post(url('/purchases'))
            .send({ txn_date: '2026-09-01', amount: '30000' })
            .expect(201);

        const liquid = await createScheme({
            amfiCode: 119800,
            category: 'Debt Scheme - Liquid Fund',
            latestNav: '10.0000',
            latestNavDate: '2026-10-07',
        });
        navProvider.navs[119800] = businessDayNavs('2026-09-01', '2026-10-07');
        navProvider.navs[119800]['2026-10-07'] = '10.0000';
        const debt = await Holding.create({
            userId: user._id,
            schemeId: liquid._id,
        });
        await agent
            .post(url('/purchases', debt))
            .send({ txn_date: '2026-10-07', amount: '10000', units: '1000' })
            .expect(201);

        const body = await dashboard();

        expect(body.fundCount).toBe(2);
        expect(body.allocation.classes.map((c) => c.key)).toEqual([
            'equity',
            'debt',
        ]);
        expect(body.allocation.classes[1]!.valuePaise).toBe(1000000);
        const sum = body.allocation.classes.reduce((s, c) => s + c.pct, 0);
        expect(Math.abs(sum - 100)).toBeLessThan(0.02);
        expect(body.topHoldings.map((h) => h.id)).toEqual([
            p().holding.id,
            debt.id,
        ]);
    });

    it("never shows other users' holdings", async () => {
        const { agent, url } = p();
        await agent
            .post(url('/purchases'))
            .send({ txn_date: '2026-10-05', amount: '10000' })
            .expect(201);

        const other = await loginAs(makeTestApp().agent(), await createUser());
        const body = await dashboard(other);

        expect(body.fundCount).toBe(0);
        expect(body.summary.investedPaise).toBe(0);
        expect(body.history).toEqual([]);
        expect(await Transaction.countDocuments()).toBe(1);
    });

    it('updates the cached history after new transactions and NAVs', async () => {
        const { agent, url, publishNav } = p();
        await agent
            .post(url('/purchases'))
            .send({ txn_date: '2026-09-01', amount: '10000' })
            .expect(201);
        const lastPoint = async () => (await dashboard()).history.at(-1)!;

        const before = await lastPoint();
        expect(await CacheEntry.countDocuments()).toBe(1);

        // A new transaction must show up in the history.
        await agent
            .post(url('/purchases'))
            .send({ txn_date: '2026-10-05', amount: '5000' })
            .expect(201);
        const afterPurchase = await lastPoint();
        expect(afterPurchase.investedPaise).toBe(before.investedPaise + 500000);

        // So must a deleted one, even though the count goes back to where it was.
        const latest = await Transaction.findOne().sort({ _id: -1 }).orFail();
        await agent.delete(url(`/transactions/${latest.id}`)).expect(200);
        expect(await lastPoint()).toEqual(before);

        // And a newer NAV from the nightly import.
        await publishNav('2026-10-08', '40.0000');
        const afterNav = await lastPoint();
        expect(afterNav.date).toBe('2026-10-08');
        expect(afterNav.valuePaise).toBeGreaterThan(before.valuePaise);

        // Still one entry per user.
        expect(await CacheEntry.countDocuments()).toBe(1);
        expect(await Scheme.countDocuments()).toBe(1);
    });
});
