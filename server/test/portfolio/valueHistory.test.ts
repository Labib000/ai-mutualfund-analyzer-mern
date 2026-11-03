import { describe, expect, it } from 'vitest';

import type { Movement } from '../../src/portfolio/performance.js';
import {
    type HistoryInput,
    valueHistory,
} from '../../src/portfolio/valueHistory.js';

// Port of tests/Unit/Portfolio/ValueHistoryTest.php
const buy = (date: string, units: string, amountPaise: number): Movement => ({
    date,
    addsUnits: true,
    units,
    amountPaise,
});
const sell = (date: string, units: string, amountPaise: number): Movement => ({
    date,
    addsUnits: false,
    units,
    amountPaise,
});
function holding(
    movements: Movement[],
    valuedOn: string,
    navs: Record<string, string>,
): HistoryInput {
    const values = Object.values(navs);
    return {
        input: {
            movements,
            latestNav: values.at(-1) ?? null,
            latestNavDate: valuedOn,
        },
        navs,
    };
}

describe('valueHistory', () => {
    it('samples weekly dates ending on the valuation date, starting at the first transaction', () => {
        const series = valueHistory([
            holding([buy('2026-01-01', '100.000', 100000)], '2026-01-30', {
                '2026-01-01': '10.0000',
            }),
        ]);
        expect(series.map((p) => p.date)).toEqual([
            '2026-01-01',
            '2026-01-02',
            '2026-01-09',
            '2026-01-16',
            '2026-01-23',
            '2026-01-30',
        ]);
    });

    it('follows purchases and redemptions with value and FIFO invested', () => {
        const series = valueHistory([
            holding(
                [
                    buy('2026-01-01', '100.000', 100000), // ₹1,000 at ₹10
                    buy('2026-01-15', '100.000', 200000), // ₹2,000 at ₹20
                    sell('2026-01-22', '100.000', 250000), // FIFO sells the ₹1,000 lot
                ],
                '2026-01-29',
                {
                    '2026-01-01': '10.0000',
                    '2026-01-15': '20.0000',
                    '2026-01-22': '25.0000',
                    '2026-01-29': '30.0000',
                },
            ),
        ]);
        expect(series).toEqual([
            { date: '2026-01-01', valuePaise: 100000, investedPaise: 100000 },
            { date: '2026-01-08', valuePaise: 100000, investedPaise: 100000 },
            { date: '2026-01-15', valuePaise: 400000, investedPaise: 300000 },
            { date: '2026-01-22', valuePaise: 250000, investedPaise: 200000 },
            { date: '2026-01-29', valuePaise: 300000, investedPaise: 200000 },
        ]);
    });

    it('carries the NAV forward over weekends and gaps', () => {
        // Valued on Saturday 31 Jan; the last NAV is Friday's.
        const series = valueHistory([
            holding([buy('2026-01-24', '10.000', 10000)], '2026-01-31', {
                '2026-01-23': '9.0000',
                '2026-01-30': '12.0000',
            }),
        ]);
        expect(series[0]).toEqual({
            date: '2026-01-24',
            valuePaise: 9000,
            investedPaise: 10000,
        });
        expect(series[1]).toEqual({
            date: '2026-01-31',
            valuePaise: 12000,
            investedPaise: 10000,
        });
    });

    it("sums funds using each fund's own latest NAV", () => {
        const series = valueHistory([
            holding([buy('2026-01-01', '10.000', 10000)], '2026-01-29', {
                '2026-01-01': '10.0000',
                '2026-01-29': '11.0000',
            }),
            holding([buy('2026-01-01', '10.000', 10000)], '2026-01-28', {
                '2026-01-01': '10.0000',
                '2026-01-28': '12.0000',
            }),
        ]);
        expect(series.at(-1)).toEqual({
            date: '2026-01-29',
            valuePaise: 11000 + 12000,
            investedPaise: 20000,
        });
    });

    it('adds nothing for a fund before its first purchase', () => {
        const series = valueHistory([
            holding([buy('2026-01-01', '10.000', 10000)], '2026-01-29', {
                '2026-01-01': '10.0000',
            }),
            holding([buy('2026-01-20', '10.000', 50000)], '2026-01-29', {
                '2026-01-01': '50.0000',
            }),
        ]);
        expect(series[1]!.investedPaise).toBe(10000); // 8 Jan
        expect(series[4]!.investedPaise).toBe(60000); // 29 Jan
    });

    it('is empty for a portfolio without transactions', () => {
        expect(
            valueHistory([
                holding([], '2026-01-29', { '2026-01-29': '10.0000' }),
            ]),
        ).toEqual([]);
        expect(valueHistory([])).toEqual([]);
    });
});
