import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { Decimal } from '../../../src/lib/decimal.js';
import { Holding } from '../../../src/models/holding.js';
import { Scheme } from '../../../src/models/scheme.js';
import { Sip } from '../../../src/models/sip.js';
import { Transaction } from '../../../src/models/transaction.js';
import { useTestDb } from '../../support/db.js';
import { createForeignHolding, usePortfolio } from '../../support/portfolio.js';
import { createScheme } from '../../support/schemes.js';

// Port of tests/Feature/Portfolio/HoldingTest.php
describe('holdings', () => {
    useTestDb();
    const p = usePortfolio();

    const search = (q: string) =>
        p().agent.get('/api/schemes').query({ q }).expect(200);

    it('answers 401 for guests', async () => {
        await request(p().app).get('/api/holdings').expect(401);
        await request(p().app).get('/api/schemes?q=axis').expect(401);
    });

    it('lists holdings with units and value', async () => {
        await p()
            .agent.post(p().url('/purchases'))
            .send({ txn_date: '2026-10-05', amount: '10000' })
            .expect(201);
        await p()
            .agent.post(p().url('/redemptions'))
            .send({ txn_date: '2026-10-07', units: '43.507' })
            .expect(201);

        const res = await p().agent.get('/api/holdings').expect(200);

        expect(res.body.holdings).toHaveLength(1);
        const [row] = res.body.holdings;
        expect(row.id).toBe(p().holding.id);
        expect(row.performance.unitsHeld).toBe('300.000');
        expect(row.performance.valuePaise).toBe(
            Number(Decimal.mul(p().navOn('2026-10-07'), '30000', 0)),
        );
        // FIFO: the 43.507 units sold cost ₹10,000 × 43.507 / 343.507 = ₹1,266.55.
        expect(row.performance.investedPaise).toBe(873345);
        expect(row.performance.xirrStatus).toBe('too_recent');
        expect(row.scheme.name).toBe(
            "Axis Children's Fund - Direct Plan - Growth Option",
        );
        expect(res.body.summary.investedPaise).toBe(873345);
        expect(res.body.summary.unitsHeld).toBeNull();
    });

    it("shows only the user's own holdings", async () => {
        await createForeignHolding();

        const res = await p().agent.get('/api/holdings').expect(200);

        expect(res.body.holdings).toHaveLength(1);
    });

    it('sorts holdings by fund name', async () => {
        const scheme = await createScheme({
            name: 'Aditya Birla Sun Life Liquid Fund',
        });
        await Holding.create({ userId: p().user._id, schemeId: scheme._id });

        const res = await p().agent.get('/api/holdings').expect(200);

        expect(
            res.body.holdings.map(
                (h: { scheme: { name: string } }) => h.scheme.name,
            ),
        ).toEqual([
            'Aditya Birla Sun Life Liquid Fund',
            "Axis Children's Fund - Direct Plan - Growth Option",
        ]);
    });

    it('matches every search word in any order', async () => {
        await createScheme({
            name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
        });
        await createScheme({
            name: 'Parag Parikh Flexi Cap Fund - Regular Plan - Growth',
        });
        await createScheme({
            name: 'HDFC Flexi Cap Fund - Direct Plan - Growth',
        });

        const res = await search('direct flexi parag');

        expect(res.body.query).toBe('direct flexi parag');
        expect(res.body.results).toHaveLength(1);
        expect(res.body.results[0].name).toBe(
            'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
        );
        expect(res.body.results[0].isHeld).toBe(false);
        expect(res.body.results[0].holdingId).toBeNull();
        expect(res.body.results[0].amc).toBe('Test Mutual Fund');
    });

    it('excludes inactive schemes and those without a NAV', async () => {
        await createScheme({ name: 'Closed Gilt Fund', isActive: false });
        await createScheme({ name: 'Segregated Gilt Fund', latestNav: null });
        await createScheme({ name: 'Open Gilt Fund' });

        const res = await search('gilt');

        expect(res.body.results.map((r: { name: string }) => r.name)).toEqual([
            'Open Gilt Fund',
        ]);
    });

    it('marks schemes already held', async () => {
        const res = await search('axis children');

        expect(res.body.results[0].isHeld).toBe(true);
        expect(res.body.results[0].holdingId).toBe(p().holding.id);
    });

    it('treats regex characters literally', async () => {
        await createScheme({ name: 'Some Fund' });

        expect((await search('%%')).body.results).toHaveLength(0);
        expect((await search('.*')).body.results).toHaveLength(0);
        expect((await search('(fund')).body.results).toHaveLength(0);
    });

    it('returns no results for short queries', async () => {
        expect((await search('a')).body.results).toHaveLength(0);
    });

    it('adds a scheme once', async () => {
        const scheme = await createScheme();

        const res = await p()
            .agent.post('/api/holdings')
            .send({ scheme_id: scheme.id })
            .expect(201);

        const holding = await Holding.findOne({
            schemeId: scheme._id,
        }).orFail();
        expect(res.body).toEqual({
            holding: { id: holding.id },
            message: 'Fund added. Now record a purchase or a SIP.',
        });
        expect(String(holding.userId)).toBe(p().user.id);

        const again = await p()
            .agent.post('/api/holdings')
            .send({ scheme_id: scheme.id })
            .expect(422);
        expect(again.body.errors.scheme_id).toBe(
            'This fund is already in your portfolio.',
        );
    });

    it('refuses inactive or unknown schemes', async () => {
        const scheme = await createScheme({ isActive: false });

        const inactive = await p()
            .agent.post('/api/holdings')
            .send({ scheme_id: scheme.id })
            .expect(422);
        expect(inactive.body.errors.scheme_id).toBe(
            'This fund is no longer active.',
        );

        const invalid = await p()
            .agent.post('/api/holdings')
            .send({ scheme_id: 'nope' })
            .expect(422);
        expect(invalid.body.errors.scheme_id).toBe(
            'The selected scheme id is invalid.',
        );
    });

    it('shows transactions and SIPs on the holding page', async () => {
        await p()
            .agent.post(p().url('/purchases'))
            .send({ txn_date: '2026-10-04', amount: '10000' })
            .expect(201);
        await p()
            .agent.post(p().url('/sips'))
            .send({
                amount: '5000',
                day_of_month: 31,
                start_date: '2026-09-01',
            })
            .expect(201);

        const res = await p().agent.get(p().url()).expect(200);

        expect(res.body.today).toBe('2026-10-08');
        expect(res.body.holding.id).toBe(p().holding.id);
        expect(res.body.holding.scheme.latestNavDate).toBe('2026-10-07');
        expect(res.body.transactions).toHaveLength(2);
        expect(res.body.transactions[0]).toMatchObject({
            type: 'purchase',
            txnDate: '2026-10-04',
            navDate: '2026-10-05',
            units: '343.507',
            fromSip: false,
        });
        expect(res.body.transactions[1]).toMatchObject({
            type: 'sip_installment',
            fromSip: true,
        });
        expect(res.body.sips).toHaveLength(1);
        expect(res.body.sips[0]).toMatchObject({
            isRunning: true,
            nextDue: '2026-10-31',
            earliestEndDate: '2026-09-30',
        });
    });

    it("includes the fund's own stats once its NAV history is stored", async () => {
        // The purchase above fetched the history; here nothing has yet.
        const before = await p().agent.get(p().url()).expect(200);
        expect(before.body.fundStats).toBeNull();

        await p()
            .agent.post(p().url('/purchases'))
            .send({ txn_date: '2026-10-04', amount: '10000' })
            .expect(201);
        const res = await p().agent.get(p().url()).expect(200);

        expect(res.body.fundStats).toMatchObject({
            asOf: '2026-10-07',
            since: '2025-01-01',
            sinceStartAnnualised: true,
            cagr3yPct: null,
        });
        expect(res.body.fundStats.return1yPct).toBeGreaterThan(0);
        expect(res.body.fundStats.maxDrawdownPct).toBeGreaterThan(0);
    });

    it("answers 404 for another user's holding", async () => {
        const other = await createForeignHolding();

        await p().agent.get(p().url('', other)).expect(404);
        await p().agent.delete(p().url('', other)).expect(404);
        await p().agent.get('/api/holdings/not-an-id').expect(404);

        expect(await Holding.exists({ _id: other._id })).not.toBeNull();
    });

    it('deletes its transactions and SIPs when a holding is removed', async () => {
        await p()
            .agent.post(p().url('/purchases'))
            .send({ txn_date: '2026-10-05', amount: '10000' })
            .expect(201);
        await p()
            .agent.post(p().url('/sips'))
            .send({ amount: '5000', day_of_month: 5, start_date: '2026-09-01' })
            .expect(201);

        const res = await p().agent.delete(p().url()).expect(200);

        expect(res.body.message).toBe('Fund removed from your portfolio.');
        expect(await Holding.exists({ _id: p().holding._id })).toBeNull();
        expect(await Transaction.countDocuments()).toBe(0);
        expect(await Sip.countDocuments()).toBe(0);
        expect(await Scheme.exists({ _id: p().scheme._id })).not.toBeNull();
    });
});
