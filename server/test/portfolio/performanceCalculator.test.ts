import { describe, expect, it } from 'vitest';

import { addDays } from '../../src/lib/dates.js';
import type {
    HoldingInput,
    Movement,
} from '../../src/portfolio/performance.js';
import {
    holdingPerformance,
    portfolioPerformance,
} from '../../src/portfolio/performanceCalculator.js';

// Port of tests/Unit/Portfolio/PerformanceCalculatorTest.php
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

const holding = (
    movements: Movement[],
    latestNav: string | null,
    latestNavDate: string | null,
): HoldingInput => ({ movements, latestNav, latestNavDate });

const partialRedemption = () =>
    holding(
        [
            buy('2025-01-10', '1000.000', 1000000_00),
            buy('2025-04-10', '400.000', 500000_00),
            sell('2025-09-01', '400.000', 400000_00),
        ],
        '1250.0000',
        '2026-02-01',
    );

const holdingSpanning = (days: number) =>
    holdingPerformance(
        holding(
            [buy('2025-01-01', '100.000', 100000)],
            '10.5000',
            addDays('2025-01-01', days),
        ),
    );

describe('PerformanceCalculator', () => {
    it('handles a fund with a partial redemption', () => {
        // The same cash flows as the xirr partial-redemption case (LibreOffice XIRR 0.115020617957131).
        const p = holdingPerformance(partialRedemption());

        expect(p.unitsHeld).toBe('1000.000');
        expect(p.valuePaise).toBe(1250000_00);
        // 600 units left from lot 1 (₹6,00,000) + all of lot 2 (₹5,00,000).
        expect(p.investedPaise).toBe(1100000_00);
        expect(p.unrealisedGainPaise).toBe(150000_00);
        // 400 units of lot 1 cost ₹4,00,000 and were sold for ₹4,00,000.
        expect(p.realisedGainPaise).toBe(0);
        expect(p.absoluteReturnPct).toBeCloseTo(13.6364, 4);
        expect(Math.abs(p.xirr! - 0.115020617957131)).toBeLessThan(1e-7);
        expect(p.xirrStatus).toBe('ok');
        expect(p.valuedOn).toBe('2026-02-01');
    });

    it('orders a same-day purchase before the redemption', () => {
        const p = holdingPerformance(
            holding(
                [
                    sell('2026-01-10', '10.000', 11000),
                    buy('2026-01-10', '10.000', 10000),
                ],
                '11.0000',
                '2026-02-10',
            ),
        );

        expect(p.unitsHeld).toBe('0.000');
        expect(p.realisedGainPaise).toBe(1000);
    });

    it('hides XIRR before 30 days', () => {
        const p = holdingSpanning(29);

        expect(p.xirr).toBeNull();
        expect(p.xirrStatus).toBe('too_recent');
    });

    it('marks XIRR from 30 days as a short period', () => {
        const p = holdingSpanning(30);

        expect(p.xirr).not.toBeNull();
        expect(p.xirrStatus).toBe('short_period');
        expect(holdingSpanning(364).xirrStatus).toBe('short_period');
    });

    it('marks XIRR from a year as ok', () => {
        expect(holdingSpanning(365).xirrStatus).toBe('ok');
    });

    it('keeps the realised gain and XIRR of a fully redeemed fund', () => {
        const p = holdingPerformance(
            holding(
                [
                    buy('2025-01-01', '100.000', 100000_00),
                    sell('2026-01-01', '100.000', 85000_00),
                ],
                '900.0000',
                '2026-10-07',
            ),
        );

        expect(p.investedPaise).toBe(0);
        expect(p.valuePaise).toBe(0);
        expect(p.realisedGainPaise).toBe(-15000_00);
        expect(p.absoluteReturnPct).toBeNull();
        expect(Math.abs(p.xirr! - -0.15)).toBeLessThan(1e-7);
        expect(p.valuedOn).toBeNull();
    });

    it('handles a fund without transactions', () => {
        const p = holdingPerformance(holding([], '10.0000', '2026-10-07'));

        expect(p.investedPaise).toBe(0);
        expect(p.valuePaise).toBe(0);
        expect(p.xirrStatus).toBe('not_meaningful');
    });

    it('adds up funds in a portfolio and runs one XIRR over all flows', () => {
        const equity = holding(
            [buy('2025-01-01', '100.000', 100000_00)],
            '1100.0000',
            '2026-01-01',
        );
        const debt = holding(
            [buy('2025-01-01', '100.000', 100000_00)],
            '1060.0000',
            '2025-12-31',
        );

        const p = portfolioPerformance([equity, debt]);

        expect(p.unitsHeld).toBeNull();
        expect(p.investedPaise).toBe(200000_00);
        expect(p.valuePaise).toBe(216000_00);
        expect(p.unrealisedGainPaise).toBe(16000_00);
        expect(p.valuedOn).toBe('2026-01-01');
        // Between the two funds' own rates (10% over 365 days, 6% over 364 days).
        expect(p.xirr).toBeGreaterThan(0.06);
        expect(p.xirr).toBeLessThan(0.1);
    });

    it('rounds percentages in the JSON', () => {
        const json = holdingPerformance(partialRedemption()).toJSON();

        expect(json.absoluteReturnPct).toBe(13.64);
        expect(json.xirrPct).toBe(11.5);
        expect(json.xirrStatus).toBe('ok');
        expect(json.totalGainPaise).toBe(15000000);
        expect(
            JSON.parse(JSON.stringify(holdingPerformance(partialRedemption()))),
        ).toEqual(json);
    });

    it('has no value without a NAV', () => {
        const p = holdingPerformance(
            holding([buy('2025-01-01', '100.000', 100000)], null, null),
        );

        expect(p.unitsHeld).toBe('100.000');
        expect(p.valuePaise).toBe(0);
        expect(p.investedPaise).toBe(100000);
        expect(p.valuedOn).toBeNull();
    });
});
