import { describe, expect, it } from 'vitest';

import { Holding } from '../../../src/models/holding.js';
import { Transaction } from '../../../src/models/transaction.js';
import { useTestDb } from '../../support/db.js';
import { createScheme } from '../../support/schemes.js';
import {
    createForeignHolding,
    createTransaction,
    usePortfolio,
} from '../../support/portfolio.js';

// Port of tests/Feature/Portfolio/TransactionDeleteTest.php
describe('deleting transactions', () => {
    useTestDb();
    const p = usePortfolio();

    const buy = () =>
        p()
            .agent.post(p().url('/purchases'))
            .send({ txn_date: '2026-10-05', amount: '10000' })
            .expect(201);

    const redeemAll = () =>
        p()
            .agent.post(p().url('/redemptions'))
            .send({ txn_date: '2026-10-07', all_units: true })
            .expect(201);

    const destroy = (id: string, holding = p().holding) =>
        p().agent.delete(p().url(`/transactions/${id}`, holding));

    it('deletes a purchase', async () => {
        await buy();
        const purchase = await Transaction.findOne().orFail();

        const res = await destroy(purchase.id as string).expect(200);

        expect(res.body.message).toBe('Transaction deleted.');
        expect(await Transaction.countDocuments()).toBe(0);
    });

    it('blocks deleting a purchase that funds a later redemption', async () => {
        await buy();
        const purchase = await Transaction.findOne().orFail();
        await redeemAll();

        const res = await destroy(purchase.id as string).expect(422);

        expect(res.body.errors.transaction).toBe(
            'Deleting this would leave the redemption on 7 Oct 2026 with more units than you held.',
        );
        expect(await Transaction.countDocuments()).toBe(2);
    });

    it('always allows deleting a redemption', async () => {
        await buy();
        await redeemAll();
        const redemption = await Transaction.findOne({
            type: 'redemption',
        }).orFail();

        await destroy(redemption.id as string).expect(200);

        expect(await Transaction.countDocuments()).toBe(1);
    });

    it('answers 404 for a transaction from another holding', async () => {
        const otherHolding = await Holding.create({
            userId: p().user._id,
            schemeId: (await createScheme())._id,
        });
        const foreign = await createTransaction(otherHolding);

        await destroy(foreign.id as string).expect(404);

        expect(await Transaction.countDocuments()).toBe(1);
    });

    it("answers 404 for another user's transaction", async () => {
        const foreignHolding = await createForeignHolding();
        const foreign = await createTransaction(foreignHolding);

        await destroy(foreign.id as string, foreignHolding).expect(404);
        await destroy('not-an-id').expect(404);

        expect(await Transaction.countDocuments()).toBe(1);
    });
});
