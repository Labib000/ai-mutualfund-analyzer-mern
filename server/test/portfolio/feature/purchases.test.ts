import { describe, expect, it } from 'vitest';

import { Transaction } from '../../../src/models/transaction.js';
import { useTestDb } from '../../support/db.js';
import { createForeignHolding, usePortfolio } from '../../support/portfolio.js';

// Port of tests/Feature/Portfolio/PurchaseTest.php
describe('purchases', () => {
    useTestDb();
    const p = usePortfolio();

    const purchase = (body: Record<string, unknown>) =>
        p().agent.post(p().url('/purchases')).send(body);

    it("uses the next business day's NAV for a weekend purchase, after stamp duty", async () => {
        const res = await purchase({
            txn_date: '2026-10-04',
            amount: '10000',
        }).expect(201);

        expect(res.body.message).toBe('Purchase recorded: 343.507 units.');

        const t = await Transaction.findOne().orFail();
        expect(t.type).toBe('purchase');
        expect(t.txnDate).toBe('2026-10-04');
        expect(t.navDate).toBe('2026-10-05');
        expect(t.nav).toBe('29.1100');
        expect(t.amountPaise).toBe(1000000);
        expect(t.stampDutyPaise).toBe(50);
        expect(t.units).toBe('343.507');
        expect(t.unitsOverridden).toBe(false);
        expect(String(t.userId)).toBe(p().user.id);
    });

    it("uses the next business day's NAV for a holiday purchase", async () => {
        await purchase({ txn_date: '2026-10-02', amount: '5000' }).expect(201);

        expect((await Transaction.findOne().orFail()).navDate).toBe(
            '2026-10-05',
        );
    });

    it('lets units be overridden to match a statement', async () => {
        await purchase({
            txn_date: '2026-10-05',
            amount: '10000',
            units: '343.5',
        }).expect(201);

        const t = await Transaction.findOne().orFail();
        expect(t.units).toBe('343.500');
        expect(t.unitsOverridden).toBe(true);
    });

    it('accepts paise and Indian grouping in amounts', async () => {
        await purchase({
            txn_date: '2026-10-05',
            amount: '1,00,000.50',
        }).expect(201);

        expect((await Transaction.findOne().orFail()).amountPaise).toBe(
            10000050,
        );
    });

    it("rejects today's purchase until the NAV is published", async () => {
        const res = await purchase({
            txn_date: '2026-10-08',
            amount: '1000',
        }).expect(422);

        expect(res.body.errors.txn_date).toBe(
            "Today's NAV isn't published yet. Add this after 11 PM IST or tomorrow.",
        );
        expect(await Transaction.countDocuments()).toBe(0);
    });

    it('rejects future dates', async () => {
        const res = await purchase({
            txn_date: '2026-10-09',
            amount: '1000',
        }).expect(422);

        expect(res.body.errors.txn_date).toBe(
            'The date cannot be in the future.',
        );
    });

    it("rejects dates before the scheme's history", async () => {
        const res = await purchase({
            txn_date: '2020-01-01',
            amount: '1000',
        }).expect(422);

        expect(res.body.errors.txn_date).toBe(
            'No NAV is available for 1 Jan 2020.',
        );
    });

    it('gives a friendly error when the NAV source is unreachable', async () => {
        p().navProvider.failing = true;

        const res = await purchase({
            txn_date: '2026-10-05',
            amount: '1000',
        }).expect(422);

        expect(res.body.errors.txn_date).toBe(
            "Couldn't fetch NAV history right now, please try again.",
        );
    });

    it('rejects invalid amounts and units', async () => {
        const first = await purchase({
            txn_date: '2026-10-05',
            amount: '10.005',
            units: '1.0001',
        }).expect(422);
        expect(Object.keys(first.body.errors).sort()).toEqual([
            'amount',
            'units',
        ]);

        const second = await purchase({
            txn_date: '2026-10-05',
            amount: '0.50',
        }).expect(422);
        expect(second.body.errors.amount).toBe(
            'The amount must be at least ₹1.',
        );
    });

    it("answers 404 for another user's holding", async () => {
        const other = await createForeignHolding(undefined, p().scheme);

        await p()
            .agent.post(p().url('/purchases', other))
            .send({ txn_date: '2026-10-05', amount: '1000' })
            .expect(404);

        expect(await Transaction.countDocuments()).toBe(0);
    });

    it('requires a date and an amount', async () => {
        const res = await purchase({}).expect(422);

        expect(res.body.errors).toEqual({
            txn_date: 'The date field is required.',
            amount: 'The amount field is required.',
        });
    });
});
