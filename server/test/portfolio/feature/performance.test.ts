import { beforeEach, describe, expect, it } from 'vitest';

import { Scheme } from '../../../src/models/scheme.js';
import { performanceForHolding } from '../../../src/portfolio/portfolioPerformance.js';
import { useTestDb } from '../../support/db.js';
import { usePortfolio } from '../../support/portfolio.js';

// Port of tests/Feature/Portfolio/PerformanceTest.php
describe('performance', () => {
    useTestDb();
    const p = usePortfolio();

    // A year of ₹5,000 SIP installments, a ₹20,000 lump sum, and 100 units redeemed.
    beforeEach(async () => {
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
    });

    it('shows FIFO figures and an XIRR matching a spreadsheet on the fund page', async () => {
        const res = await p().agent.get(p().url()).expect(200);

        expect(res.body.holding.performance).toEqual({
            unitsHeld: '6242.899',
            investedPaise: 8380194,
            valuePaise: 9108390,
            unrealisedGainPaise: 728196,
            realisedGainPaise: 17694,
            totalGainPaise: 745890,
            absoluteReturnPct: 8.69,
            xirrPct: 15.63,
            xirrStatus: 'ok',
            valuedOn: '2026-10-07',
        });
    });

    it('matches LibreOffice XIRR for the same cash flows', async () => {
        // The 15 transactions above plus the current value on 7 Oct 2026, entered into
        // LibreOffice Calc's XIRR(): 0.156347524112936.
        const scheme = await Scheme.findById(p().scheme._id).lean().orFail();
        const performance = await performanceForHolding(
            p().holding._id,
            scheme,
        );

        expect(Math.abs(performance.xirr! - 0.156347524112936)).toBeLessThan(
            1e-7,
        );
    });

    it('includes the fund in the portfolio summary', async () => {
        const res = await p().agent.get('/api/holdings').expect(200);

        expect(res.body.summary).toMatchObject({
            investedPaise: 8380194,
            valuePaise: 9108390,
            totalGainPaise: 745890,
            xirrPct: 15.63,
        });
    });
});
