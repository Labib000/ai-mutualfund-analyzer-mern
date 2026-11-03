import { describe, expect, it } from 'vitest';

import { addMonthsNoOverflow } from '../support/dates.js';
import { type CashFlow, xirr } from '../../src/portfolio/xirr.js';

// Port of tests/Unit/Portfolio/XirrTest.php
const TOLERANCE = 1e-7;

/** [amount in rupees, "YYYY-MM-DD"] */
type Flow = [number, string];

const rate = (flows: Flow[]) =>
    xirr(
        flows.map(([rupees, date]): CashFlow => ({
            date,
            amountPaise: rupees * 100,
        })),
    );

function expectRate(expected: number, flows: Flow[]) {
    const result = rate(flows);
    expect(result).not.toBeNull();
    expect(Math.abs(result! - expected)).toBeLessThan(TOLERANCE);
}

/** ₹5,000 on the 5th of every month for 2024–2025, worth ₹1,40,000 on 10 Jan 2026. */
function sipFlows(): Flow[] {
    const flows: Flow[] = [];
    for (let month = 0; month < 24; month += 1) {
        flows.push([-5000, addMonthsNoOverflow('2024-01-05', month)]);
    }
    flows.push([140000, '2026-01-10']);
    return flows;
}

/** Deterministic Fisher–Yates shuffle (mulberry32). */
function shuffled<T>(items: T[], seed: number): T[] {
    const out = [...items];
    let state = seed;
    const random = () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}

describe('xirr', () => {
    it("matches Microsoft's documented example", () => {
        expectRate(0.373362533518832, [
            [-10000, '2008-01-01'],
            [2750, '2008-03-01'],
            [4250, '2008-10-30'],
            [3250, '2009-02-15'],
            [2750, '2009-04-01'],
        ]);
    });

    it('solves a two-year monthly SIP with current value', () => {
        expectRate(0.153193594755617, sipFlows());
    });

    it('does not depend on input order', () => {
        expectRate(0.153193594755617, shuffled(sipFlows(), 7));
    });

    it('gives a negative rate for a loss', () => {
        expectRate(-0.15, [
            [-100000, '2025-01-01'],
            [85000, '2026-01-01'],
        ]);
    });

    it('solves a very high short-term return', () => {
        expectRate(24.6758687426491, [
            [-10000, '2025-01-01'],
            [50000, '2025-07-01'],
        ]);
    });

    it('handles several flows on the same day', () => {
        expectRate(0.146141235300258, [
            [-5000, '2025-01-01'],
            [-3000, '2025-01-01'],
            [2000, '2025-06-01'],
            [7000, '2025-12-31'],
        ]);
    });

    it('handles partial redemptions before the final value', () => {
        expectRate(0.115020617957131, [
            [-1000000, '2025-01-10'],
            [-500000, '2025-04-10'],
            [400000, '2025-09-01'],
            [1250000, '2026-02-01'],
        ]);
    });

    it('solves a near-total loss with the bisection fallback', () => {
        // LibreOffice gives #VALUE! here; with two flows the exact answer is
        // (10 / 10000)^(365 / 366) − 1, since 2024 is a leap year.
        expectRate((10 / 10000) ** (365 / 366) - 1, [
            [-10000, '2024-01-01'],
            [10, '2025-01-01'],
        ]);
    });

    it('ignores zero amounts', () => {
        expectRate(-0.15, [
            [-100000, '2025-01-01'],
            [0, '2025-06-01'],
            [85000, '2026-01-01'],
        ]);
    });

    it('has no rate without flows of both signs', () => {
        expect(
            rate([
                [-1000, '2025-01-01'],
                [-2000, '2025-02-01'],
            ]),
        ).toBeNull();
        expect(
            rate([
                [1000, '2025-01-01'],
                [2000, '2025-02-01'],
            ]),
        ).toBeNull();
        expect(rate([[-1000, '2025-01-01']])).toBeNull();
        expect(rate([])).toBeNull();
    });
});
