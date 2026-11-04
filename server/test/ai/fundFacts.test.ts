import type { FundStatsJson } from '@hisaab/shared';
import { describe, expect, it } from 'vitest';

import { fundFactsFull, fundFactsShort } from '../../src/ai/fundFacts.js';

const stats = (overrides: Partial<FundStatsJson> = {}): FundStatsJson => ({
    asOf: '2026-10-07',
    since: '2013-01-02',
    return1yPct: 21.73,
    cagr3yPct: 15.2,
    cagr5yPct: -0.04,
    sinceStartPct: 14.06,
    sinceStartAnnualised: true,
    volatilityPct: 14.25,
    maxDrawdownPct: 38.46,
    drawdownPeak: '2020-01-17',
    drawdownTrough: '2020-03-23',
    ...overrides,
});

describe('fund facts', () => {
    it('give every figure for the explainer', () => {
        expect(fundFactsFull(stats())).toBe(
            [
                'Past NAV returns up to 7 Oct 2026: 1 year +21.7%; 3 years +15.2% a year; 5 years 0.0% a year; since 2 Jan 2013 +14.1% a year.',
                'Volatility (annualised spread of weekly returns, last 3 years or less): 14.3%.',
                'Largest fall from a peak since 2 Jan 2013: −38.5% (from 17 Jan 2020 to 23 Mar 2020).',
            ].join('\n'),
        );
    });

    it('give the headline figures in one phrase', () => {
        expect(fundFactsShort(stats())).toBe(
            'fund NAV return 1y +21.7%, 3y +15.2% p.a., 5y 0.0% p.a.; volatility 14.3%; largest fall −38.5%',
        );
    });

    it('fall back to the return since launch for a young fund', () => {
        const young = stats({
            since: '2026-03-02',
            return1yPct: null,
            cagr3yPct: null,
            cagr5yPct: null,
            sinceStartPct: 4.5,
            sinceStartAnnualised: false,
            volatilityPct: null,
            maxDrawdownPct: 0,
            drawdownPeak: null,
            drawdownTrough: null,
        });
        expect(fundFactsShort(young)).toBe(
            'fund NAV return since 2 Mar 2026 +4.5% in total (less than a year of history)',
        );
        expect(fundFactsFull(young)).toBe(
            'Past NAV returns up to 7 Oct 2026: since 2 Mar 2026 +4.5% in total (less than a year of history).\nLargest fall from a peak since 2 Mar 2026: none.',
        );
    });
});
