import { describe, expect, it } from 'vitest';

import { addDays, addYearsOverflow } from '../../src/lib/dates.js';
import { Decimal } from '../../src/lib/decimal.js';
import {
    type FundStats,
    fundStats,
    fundStatsJson,
} from '../../src/portfolio/fundStats.js';

// Port of tests/Unit/Portfolio/FundStatsTest.php
const TOLERANCE = 9; // decimal places, i.e. 1e-9

const longHistory = {
    '2021-01-01': '8.0000',
    '2021-10-07': '12.5000',
    '2022-06-01': '15.0000',
    '2023-03-01': '9.0000',
    '2023-10-07': '10.0000',
    '2025-10-07': '16.0000',
    '2026-10-07': '20.0000',
};

function stats(navs: Record<string, string>): FundStats {
    const result = fundStats(navs);
    expect(result).not.toBeNull();
    return result!;
}

describe('fundStats', () => {
    it('compounds trailing returns annually', () => {
        const s = stats(longHistory);

        expect(s.asOf).toBe('2026-10-07');
        expect(s.since).toBe('2021-01-01');
        expect(s.return1y).toBeCloseTo(0.25, TOLERANCE); // 16 → 20
        expect(s.cagr3y).toBeCloseTo(2 ** (1 / 3) - 1, TOLERANCE); // 10 → 20
        expect(s.cagr5y).toBeCloseTo(1.6 ** (1 / 5) - 1, TOLERANCE); // 12.5 → 20
    });

    it('annualises the return since the first NAV after a year', () => {
        const s = stats(longHistory);

        // 8 → 20 over 2,105 days.
        expect(s.sinceStartAnnualised).toBe(true);
        expect(s.sinceStart).toBeCloseTo(2.5 ** (365 / 2105) - 1, TOLERANCE);
    });

    it('finds the largest fall from a peak', () => {
        const s = stats(longHistory);

        // 15 on 1 Jun 2022 down to 9 on 1 Mar 2023; later lows are shallower.
        expect(s.maxDrawdown).toBeCloseTo(0.4, TOLERANCE);
        expect(s.drawdownPeak).toBe('2022-06-01');
        expect(s.drawdownTrough).toBe('2023-03-01');
    });

    it('has no drawdown when the NAV never falls', () => {
        const s = stats({
            '2026-01-01': '10.0000',
            '2026-02-01': '10.5000',
            '2026-03-01': '11.0000',
        });

        expect(s.maxDrawdown).toBe(0);
        expect(s.drawdownPeak).toBeNull();
        expect(s.drawdownTrough).toBeNull();
    });

    it('annualises the spread of weekly returns', () => {
        // 53 weekly NAVs alternating 10 and 11: 26 returns of +10% and 26 of −1/11.
        const navs: Record<string, string> = {};
        for (let week = 52; week >= 0; week--) {
            navs[addDays('2026-10-07', -7 * week)] =
                week % 2 === 0 ? '10.0000' : '11.0000';
        }

        const deviation = (0.1 + 1 / 11) / 2;
        const expected = deviation * Math.sqrt(52 / 51) * Math.sqrt(52);

        expect(stats(navs).volatility).toBeCloseTo(expected, 6);
    });

    it('gives steady growth almost no volatility', () => {
        const navs: Record<string, string> = {};
        let nav = '10.0000';
        for (
            let date = '2025-01-01';
            date <= '2026-10-07';
            date = addDays(date, 1)
        ) {
            navs[date] = nav;
            nav = Decimal.add(nav, '0.0100', 4);
        }

        expect(stats(navs).volatility).toBeLessThan(0.01);
    });

    it('gives a short history no trailing returns and an absolute return', () => {
        const s = stats({ '2026-04-01': '10.0000', '2026-10-07': '11.0000' });

        expect(s.return1y).toBeNull();
        expect(s.cagr3y).toBeNull();
        expect(s.cagr5y).toBeNull();
        expect(s.volatility).toBeNull();
        expect(s.sinceStartAnnualised).toBe(false);
        expect(s.sinceStart).toBeCloseTo(0.1, TOLERANCE);
    });

    it('starts a trailing period at the NAV on or before its start', () => {
        // 7 Oct 2025 had no NAV; 6 Oct's applies.
        const s = stats({
            '2025-10-06': '10.0000',
            '2025-10-08': '50.0000',
            '2026-10-07': '12.0000',
        });

        expect(s.return1y).toBeCloseTo(0.2, TOLERANCE);
    });

    it('gives no stats with too little history', () => {
        expect(fundStats({})).toBeNull();
        expect(fundStats({ '2026-10-07': '10.0000' })).toBeNull();
        expect(
            fundStats({ '2026-10-06': '0.0000', '2026-10-07': '10.0000' }),
        ).toBeNull();
    });

    it('adjusts earlier NAVs for a change of face value', () => {
        // Like HDFC Liquid Fund on 30 Aug 2015: ₹28.56 → ₹2,857.24 (×100.04).
        const s = stats({
            '2014-08-29': '26.6000',
            '2015-08-28': '28.5603',
            '2015-08-30': '2857.2400',
            '2016-08-30': '3060.0000',
        });

        // 2,660 → 3,060 on the new basis: about +7.2% a year, not +200%.
        expect(s.sinceStart).toBeCloseTo(
            (3060 / 2660) ** (365 / 732) - 1,
            TOLERANCE,
        );
        expect(s.return1y).toBeCloseTo(3060 / 2857.24 - 1, TOLERANCE);
        expect(s.maxDrawdown).toBe(0);
    });

    it('does not count a face-value cut as a fall', () => {
        const s = stats({
            '2024-01-01': '1000.0000',
            '2024-06-01': '1100.0000',
            '2024-06-02': '11.0500',
            '2025-01-01': '11.5000',
        });

        // 10 → 11.5 on the new basis; the ÷100 day itself is a small gain.
        expect(s.sinceStart).toBeCloseTo(
            (11.5 / 10) ** (365 / 366) - 1,
            TOLERANCE,
        );
        expect(s.maxDrawdown).toBe(0);
    });

    it('treats a jump that is not near a power of ten as its exact ratio', () => {
        const s = stats({
            '2025-01-01': '10.0000',
            '2025-01-02': '500.0000',
            '2025-06-01': '550.0000',
        });

        // ×50 is folded in whole, leaving only the later 10% rise.
        expect(s.sinceStart).toBeCloseTo(0.1, TOLERANCE);
    });

    it('leaves real market moves alone', () => {
        const s = stats({
            '2020-03-12': '100.0000',
            '2020-03-13': '87.0000',
            '2020-03-16': '100.0000',
        });

        expect(s.maxDrawdown).toBeCloseTo(0.13, TOLERANCE);
    });

    it('rounds percentages for the API', () => {
        const json = fundStatsJson(stats(longHistory));

        expect(json.return1yPct).toBe(25);
        expect(json.maxDrawdownPct).toBe(40);
        expect(json.sinceStartAnnualised).toBe(true);
    });
});

describe('addYearsOverflow', () => {
    it('overflows from 29 February like Carbon', () => {
        expect(addYearsOverflow('2024-02-29', -1)).toBe('2023-03-01');
        expect(addYearsOverflow('2026-10-07', -3)).toBe('2023-10-07');
    });
});
