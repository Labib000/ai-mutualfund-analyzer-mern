import { describe, expect, it } from 'vitest';

import { Decimal } from '../../../src/lib/decimal.js';
import { setTestNow } from '../../../src/lib/today.js';
import { Holding } from '../../../src/models/holding.js';
import { Sip } from '../../../src/models/sip.js';
import { Transaction } from '../../../src/models/transaction.js';
import { useTestDb } from '../../support/db.js';
import { usePortfolio } from '../../support/portfolio.js';
import { createScheme } from '../../support/schemes.js';

// Port of tests/Feature/Portfolio/SipTest.php
describe('SIPs', () => {
    useTestDb();
    const p = usePortfolio();

    const createSip = (body: Record<string, unknown>) =>
        p().agent.post(p().url('/sips')).send(body);

    const theSip = () => Sip.findOne().orFail();
    const sipUrl = async (path = '') =>
        p().url(`/sips/${(await theSip()).id}${path}`);
    const txnDates = async () =>
        (await Transaction.find().sort({ txnDate: 1 }).lean()).map(
            (t) => t.txnDate,
        );

    it('backfills past installments with month-end and holiday rules', async () => {
        const res = await createSip({
            amount: '5000',
            day_of_month: 31,
            start_date: '2026-01-01',
        }).expect(201);

        expect(res.body.message).toBe('SIP added with 9 past installments.');

        const installments = await Transaction.find()
            .sort({ txnDate: 1 })
            .lean();
        expect(installments.map((t) => t.txnDate)).toEqual([
            '2026-01-31',
            '2026-02-28',
            '2026-03-31',
            '2026-04-30',
            '2026-05-31',
            '2026-06-30',
            '2026-07-31',
            '2026-08-31',
            '2026-09-30',
        ]);

        // 31 Jan and 28 Feb 2026 are Saturdays, so units come from the following Monday's NAV.
        expect(installments[0]!.navDate).toBe('2026-02-02');
        expect(installments[1]!.navDate).toBe('2026-03-02');

        const first = installments[0]!;
        expect(first.type).toBe('sip_installment');
        expect(first.amountPaise).toBe(500000);
        expect(first.stampDutyPaise).toBe(25);
        expect(first.units).toBe(
            Decimal.round(
                Decimal.div('4999.75', p().navOn('2026-02-02'), 10),
                3,
            ),
        );

        expect((await theSip()).generatedUntil).toBe('2026-09-30');
    });

    it('has no installments yet for a SIP starting in the future', async () => {
        const res = await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-11-01',
        }).expect(201);

        expect(res.body.message).toBe('SIP added.');
        expect(await Transaction.countDocuments()).toBe(0);
        expect((await theSip()).generatedUntil).toBeNull();
    });

    it('stops at an installment whose NAV is not published and resumes later', async () => {
        await createSip({
            amount: '1000',
            day_of_month: 8,
            start_date: '2026-09-01',
        }).expect(201);

        // 8 Sep is recorded; today's (8 Oct) NAV isn't published yet.
        expect(await txnDates()).toEqual(['2026-09-08']);

        await p().publishNav('2026-10-08', '29.5000');
        expect(await p().generateSips()).toEqual({ created: 1, failed: 0 });

        const latest = await Transaction.findOne()
            .sort({ txnDate: -1 })
            .orFail();
        expect(latest.txnDate).toBe('2026-10-08');
        expect(latest.nav).toBe('29.5000');
    });

    it('creates nothing new when generating twice', async () => {
        await createSip({
            amount: '1000',
            day_of_month: 5,
            start_date: '2026-06-01',
        }).expect(201);
        const count = await Transaction.countDocuments();

        await p().generateSips();
        await p().generateSips();

        expect(count).toBe(5);
        expect(await Transaction.countDocuments()).toBe(count);
    });

    it('changes only future installments when edited', async () => {
        await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-08-01',
        }).expect(201);

        const res = await p()
            .agent.patch(await sipUrl())
            .send({ amount: '7000', day_of_month: 20 })
            .expect(200);
        expect(res.body.message).toBe(
            'SIP updated. Recorded installments are unchanged.',
        );

        setTestNow('2026-10-26T10:00:00+05:30');
        await p().publishNav('2026-10-20', '30.0000');
        await p().generateSips();

        const rows = await Transaction.find().sort({ txnDate: 1 }).lean();
        expect(rows.map((t) => [t.txnDate, t.amountPaise])).toEqual([
            ['2026-08-05', 500000],
            ['2026-09-05', 500000],
            ['2026-10-05', 500000],
            ['2026-10-20', 700000],
        ]);
    });

    it('refuses to move the end date before recorded installments', async () => {
        await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-08-01',
        }).expect(201);

        const res = await p()
            .agent.patch(await sipUrl())
            .send({ amount: '5000', day_of_month: 5, end_date: '2026-09-30' })
            .expect(422);

        expect(res.body.errors.end_date).toBe(
            'The end date cannot be before an installment that has already been recorded.',
        );
    });

    it('creates no more installments once stopped', async () => {
        await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-08-01',
        }).expect(201);

        const res = await p()
            .agent.post(await sipUrl('/stop'))
            .expect(200);
        expect(res.body.message).toBe('SIP stopped.');
        expect((await theSip()).endDate).toBe('2026-10-08');

        setTestNow('2026-11-10T10:00:00+05:30');
        await p().publishNav('2026-11-05', '31.0000');
        await p().generateSips();

        expect(await Transaction.countDocuments()).toBe(3);
    });

    it('removes its installments but not other transactions when deleted', async () => {
        await p()
            .agent.post(p().url('/purchases'))
            .send({ txn_date: '2026-10-05', amount: '1000' })
            .expect(201);
        await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-08-01',
        }).expect(201);

        const res = await p()
            .agent.delete(await sipUrl())
            .expect(200);

        expect(res.body.message).toBe('SIP and its installments deleted.');
        expect(await Sip.countDocuments()).toBe(0);
        expect((await Transaction.find().lean()).map((t) => t.type)).toEqual([
            'purchase',
        ]);
    });

    it('blocks deleting a SIP whose units were redeemed', async () => {
        await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-08-01',
        }).expect(201);
        await p()
            .agent.post(p().url('/redemptions'))
            .send({ txn_date: '2026-10-07', all_units: true })
            .expect(201);

        const res = await p()
            .agent.delete(await sipUrl())
            .expect(422);

        expect(res.body.errors.sip).toBe(
            'Deleting this SIP and its installments would leave the redemption on 7 Oct 2026 with more units than you held.',
        );
        expect(await Sip.countDocuments()).toBe(1);
    });

    it('saves a SIP while the NAV source is down and backfills it later', async () => {
        p().navProvider.failing = true;

        const res = await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-08-01',
        }).expect(201);

        expect(res.body).toEqual({
            message:
                "SIP added. Past installments couldn't be recorded right now and will be added automatically.",
            warning: true,
        });
        expect(await Sip.countDocuments()).toBe(1);
        expect(await Transaction.countDocuments()).toBe(0);

        p().navProvider.failing = false;
        expect(await p().generateSips()).toEqual({ created: 3, failed: 0 });

        expect(await Transaction.countDocuments()).toBe(3);
    });

    it('counts SIPs that fail to generate and carries on', async () => {
        // The scheme's history was never fetched, so generation needs the provider.
        p().navProvider.failing = true;
        await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-08-01',
        }).expect(201);

        expect(await p().generateSips()).toEqual({ created: 0, failed: 1 });
        expect(await Transaction.countDocuments()).toBe(0);
    });

    it('validates SIP input', async () => {
        const res = await createSip({
            amount: '-5',
            day_of_month: 32,
            start_date: '2026-08-01',
            end_date: '2026-07-01',
        }).expect(422);

        expect(Object.keys(res.body.errors).sort()).toEqual([
            'amount',
            'day_of_month',
        ]);
        expect(res.body.errors.day_of_month).toBe(
            'The day of the month field must be between 1 and 31.',
        );

        // end_date is checked once the other fields are valid.
        const second = await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-08-01',
            end_date: '2026-07-01',
        }).expect(422);
        expect(second.body.errors.end_date).toBe(
            'The end date field must be a date after or equal to start date.',
        );
    });

    it('answers 404 for a SIP from another holding', async () => {
        const otherHolding = await Holding.create({
            userId: p().user._id,
            schemeId: (await createScheme())._id,
        });
        const foreign = await Sip.create({
            holdingId: otherHolding._id,
            userId: p().user._id,
            amountPaise: 100000,
            dayOfMonth: 5,
            startDate: '2026-01-01',
        });

        await p()
            .agent.post(p().url(`/sips/${foreign.id}/stop`))
            .expect(404);
    });

    it('cannot record the same installment twice', async () => {
        await createSip({
            amount: '5000',
            day_of_month: 5,
            start_date: '2026-09-01',
        }).expect(201);
        const installment = await Transaction.findOne().lean().orFail();

        const { _id, ...copy } = installment;
        void _id;

        await expect(Transaction.create(copy)).rejects.toMatchObject({
            code: 11000,
        });
    });
});
