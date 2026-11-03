import { beforeEach, describe, expect, it } from 'vitest';

import { Decimal } from '../../../src/lib/decimal.js';
import { Transaction } from '../../../src/models/transaction.js';
import { useTestDb } from '../../support/db.js';
import { usePortfolio } from '../../support/portfolio.js';

// Port of tests/Feature/Portfolio/RedemptionTest.php
describe('redemptions', () => {
    useTestDb();
    const p = usePortfolio();

    // 343.507 units bought on 5 Oct 2026.
    beforeEach(async () => {
        await p()
            .agent.post(p().url('/purchases'))
            .send({ txn_date: '2026-10-05', amount: '10000' })
            .expect(201);
    });

    const redeem = (body: Record<string, unknown>) =>
        p().agent.post(p().url('/redemptions')).send(body);

    const redemption = () =>
        Transaction.findOne({ type: 'redemption' }).orFail();

    it('defaults the amount to units × NAV when redeeming part of a holding', async () => {
        const res = await redeem({
            txn_date: '2026-10-07',
            units: '100',
        }).expect(201);

        expect(res.body.message).toBe('Redemption recorded: 100.000 units.');

        const r = await redemption();
        expect(r.units).toBe('100.000');
        expect(r.navDate).toBe('2026-10-07');
        expect(r.amountPaise).toBe(
            Number(Decimal.mul(p().navOn('2026-10-07'), '10000', 0)),
        );
        expect(r.stampDutyPaise).toBe(0);
    });

    it('accepts the amount received', async () => {
        await redeem({
            txn_date: '2026-10-07',
            units: '100',
            amount: '2900.25',
        }).expect(201);

        expect((await redemption()).amountPaise).toBe(290025);
    });

    it('redeems all units', async () => {
        await redeem({ txn_date: '2026-10-07', all_units: true }).expect(201);

        expect((await redemption()).units).toBe('343.507');
    });

    it('rejects redeeming more than held', async () => {
        const res = await redeem({
            txn_date: '2026-10-07',
            units: '343.508',
        }).expect(422);

        expect(res.body.errors.units).toBe(
            'You held only 343.507 units on 7 Oct 2026.',
        );
    });

    it('rejects redeeming before the purchase', async () => {
        const res = await redeem({
            txn_date: '2026-10-01',
            all_units: true,
        }).expect(422);

        expect(res.body.errors.units).toBe('You held no units on 1 Oct 2026.');
    });

    it('rejects a back-dated redemption that breaks a later one', async () => {
        await redeem({ txn_date: '2026-10-07', units: '300' }).expect(201);

        const res = await redeem({
            txn_date: '2026-10-06',
            units: '100',
        }).expect(422);

        expect(res.body.errors.units).toBe(
            'This would leave the redemption on 7 Oct 2026 with more units than you held.',
        );
    });

    it('requires units unless redeeming everything', async () => {
        const res = await redeem({ txn_date: '2026-10-07' }).expect(422);

        expect(res.body.errors.units).toBe('The units field is required.');
    });

    it('lets only one of two simultaneous full redemptions through', async () => {
        const results = await Promise.all([
            redeem({ txn_date: '2026-10-07', all_units: true }),
            redeem({ txn_date: '2026-10-07', all_units: true }),
        ]);

        expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
            201, 422,
        ]);
        expect(await Transaction.countDocuments({ type: 'redemption' })).toBe(
            1,
        );
        expect((await redemption()).units).toBe('343.507');
    });
});
