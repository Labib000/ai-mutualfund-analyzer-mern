import { describe, expect, it } from 'vitest';

import { addDays, epochDay } from '../../src/lib/dates.js';
import { compareStats } from '../../src/portfolio/fundCompare.js';

const RISK_FREE = 0.065;

/** A NAV every calendar day from `from` to `to`, worked out from the days elapsed. */
function daily(
    from: string,
    to: string,
    nav: (days: number) => number,
): Record<string, string> {
    const navs: Record<string, string> = {};
    for (let date = from, day = 0; date <= to; date = addDays(date, 1), day++) {
        navs[date] = nav(day).toFixed(6);
    }
    return navs;
}

const steady12 = daily(
    '2014-01-01',
    '2026-10-30',
    (d) => 10 * 1.12 ** (d / 365),
);

function stats(navs: Record<string, string>) {
    const result = compareStats(navs, RISK_FREE);
    expect(result).not.toBeNull();
    return result!;
}

describe('compareStats', () => {
    it('gives 12% everywhere for a fund growing a steady 12% a year', () => {
        const s = stats(steady12);

        expect(s.since).toBe('2014-01-01');
        expect(s.asOf).toBe('2026-10-30');
        for (const value of [
            s.trailing.y1Pct,
            s.trailing.y3Pct,
            s.trailing.y5Pct,
            s.trailing.y10Pct,
        ]) {
            expect(value).toBeCloseTo(12, 1);
        }
        expect(s.trailing.sinceStartPct).toBeCloseTo(12, 1);
        expect(s.trailing.sinceStartAnnualised).toBe(true);
        // 30 Sep → 30 Oct: 30 days.
        expect(s.trailing.m1Pct).toBeCloseTo((1.12 ** (30 / 365) - 1) * 100, 1);

        for (const roll of [s.rolling.y1!, s.rolling.y3!]) {
            expect(roll.avgPct).toBeCloseTo(12, 1);
            expect(roll.maxPct - roll.minPct).toBeLessThan(0.1);
            expect(roll.positivePct).toBe(100);
            expect(roll.above10Pct).toBe(100);
        }
        // About one window a week over the lookback.
        expect(s.rolling.y1!.windows).toBeGreaterThanOrEqual(260);
        // 3-year windows can only end from 2017, three years after the first NAV.
        expect(s.rolling.y3!.windows).toBeGreaterThanOrEqual(500);

        expect(s.risk.basisYears).toBe(3);
        expect(s.risk.volatilityPct).toBeLessThan(0.1);
        // No week ever did worse than the risk-free rate.
        expect(s.risk.sortino).toBeNull();
        expect(s.risk.maxDrawdownPct).toBe(0);
        expect(s.risk.recoveredOn).toBeNull();

        expect(s.sip.map((c) => c.years)).toEqual([1, 3, 5]);
        for (const check of s.sip) {
            expect(check.investedRupees).toBe(check.years * 12 * 10_000);
            expect(check.valueRupees!).toBeGreaterThan(check.investedRupees!);
            expect(check.xirrPct).toBeCloseTo(12, 0);
        }
    });

    it('measures calendar years from 31 Dec to 31 Dec, and this year so far', () => {
        const s = stats({
            '2024-12-31': '10',
            '2025-06-30': '9',
            '2025-12-31': '11',
            '2026-03-02': '12.1',
        });

        expect(s.calendarYears.map((y) => y.year)).toEqual([
            2021, 2022, 2023, 2024, 2025, 2026,
        ]);
        expect(s.calendarYears.at(-2)).toEqual({
            year: 2025,
            returnPct: 10,
            partial: false,
        });
        expect(s.calendarYears.at(-1)).toEqual({
            year: 2026,
            returnPct: 10,
            partial: true,
        });
        // The fund didn't exist on 31 Dec 2023.
        expect(s.calendarYears[3]!.returnPct).toBeNull();
    });

    it('uses the NAV on or before 31 Dec when it falls on a holiday', () => {
        const s = stats({
            '2024-12-27': '10',
            '2025-12-30': '12',
            '2026-01-05': '12',
        });

        expect(s.calendarYears.find((y) => y.year === 2025)!.returnPct).toBe(
            20,
        );
    });

    it('finds the largest fall and when it was made back', () => {
        const s = stats({
            '2025-01-01': '10',
            '2025-02-01': '12',
            '2025-03-01': '9',
            '2025-04-01': '11.5',
            '2025-05-01': '12',
            '2025-06-01': '13',
        });

        expect(s.risk.maxDrawdownPct).toBe(25);
        expect(s.risk.drawdownPeak).toBe('2025-02-01');
        expect(s.risk.drawdownTrough).toBe('2025-03-01');
        // Back to the peak's NAV counts as recovered.
        expect(s.risk.recoveredOn).toBe('2025-05-01');
    });

    it('says when a fall has not been made back yet', () => {
        const s = stats({
            '2025-01-01': '10',
            '2025-02-01': '12',
            '2025-03-01': '9',
            '2025-04-01': '11.9',
        });

        expect(s.risk.recoveredOn).toBeNull();
    });

    it('gives a SIP on a flat NAV a zero return', () => {
        const s = stats(daily('2020-01-01', '2026-10-30', () => 10));

        for (const check of s.sip) {
            expect(check.valueRupees).toBe(check.investedRupees);
            expect(check.xirrPct).toBeCloseTo(0, 6);
        }
    });

    it('buys at the next NAV when the 1st is a holiday', () => {
        const navs = daily('2025-01-01', '2026-10-30', () => 10);
        // 1 Feb 2026 has no NAV; 2 Feb is twice as dear.
        delete navs['2026-02-01'];
        navs['2026-02-02'] = '20';

        const check = stats(navs).sip[0]!;
        expect(check.investedRupees).toBe(120_000);
        expect(check.valueRupees).toBe(115_000); // 11 × ₹10,000 + 500 units × ₹10
    });

    it('leaves out what a young fund has no history for', () => {
        const s = stats(daily('2026-07-01', '2026-10-30', (d) => 10 + d / 100));

        expect(s.trailing.m3Pct).not.toBeNull();
        expect(s.trailing.m6Pct).toBeNull();
        expect(s.trailing.y1Pct).toBeNull();
        expect(s.trailing.sinceStartAnnualised).toBe(false);
        expect(s.rolling).toEqual({ y1: null, y3: null });
        expect(s.risk.sharpe).toBeNull();
        expect(s.risk.sortino).toBeNull();
        expect(
            s.sip.every((c) => c.investedRupees === null && c.xirrPct === null),
        ).toBe(true);
        expect(
            s.calendarYears.slice(0, -1).every((y) => y.returnPct === null),
        ).toBe(true);
    });

    it('works out Sharpe and Sortino for a fund that moves', () => {
        // 12% a year with a ±3% wobble every few weeks.
        const s = stats(
            daily(
                '2020-01-01',
                '2026-10-30',
                (d) => 10 * 1.12 ** (d / 365) * (1 + 0.03 * Math.sin(d / 9)),
            ),
        );

        expect(s.risk.volatilityPct).toBeGreaterThan(1);
        expect(s.risk.sharpe).toBeGreaterThan(0);
        expect(s.risk.sortino).toBeGreaterThan(0);
        expect(s.rolling.y1!.minPct).toBeLessThan(s.rolling.y1!.maxPct);
    });

    it('is not thrown by a change of face value', () => {
        const navs = { ...steady12 };
        for (const date of Object.keys(navs)) {
            if (date >= '2020-08-30')
                navs[date] = (Number(navs[date]) * 100).toFixed(6);
        }

        const s = stats(navs);
        expect(s.trailing.y10Pct).toBeCloseTo(12, 1);
        expect(s.rolling.y3!.maxPct).toBeCloseTo(12, 0);
        expect(s.risk.maxDrawdownPct).toBe(0);
        // The latest NAV stays as published.
        expect(Number(s.latestNav)).toBeGreaterThan(1000);
    });

    it('samples the NAV once a week for the chart', () => {
        const { series } = stats(steady12);

        expect(series[0]![0]).toBe('2014-01-01');
        expect(series.at(-1)![0]).toBe('2026-10-30');
        for (let i = 2; i < series.length; i++) {
            expect(epochDay(series[i]![0]) - epochDay(series[i - 1]![0])).toBe(
                7,
            );
        }
    });

    it('is null with fewer than two NAVs', () => {
        expect(compareStats({ '2026-01-01': '10' }, RISK_FREE)).toBeNull();
    });
});
