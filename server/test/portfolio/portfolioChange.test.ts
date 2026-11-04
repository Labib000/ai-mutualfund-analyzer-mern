import { describe, expect, it } from 'vitest';

import type { Movement } from '../../src/portfolio/performance.js';
import {
    changeOver,
    periodStart,
} from '../../src/portfolio/portfolioChange.js';

// Port of tests/Unit/Portfolio/PortfolioChangeTest.php
// Week to Wed 7 Oct 2026: the period starts at the close of Wed 30 Sep.
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

type Fund = [name: string, movements: Movement[], navs: Record<string, string>];

const fund = ([name, movements, navs]: Fund) => ({
    name,
    input: { movements, latestNav: null, latestNavDate: null },
    navs,
});

const week = (funds: Fund[], sipInstallments = 0) =>
    changeOver('7d', '2026-10-07', funds.map(fund), sipInstallments);

describe('changeOver', () => {
    it('moves a fund without new money only with the market', () => {
        const change = week([
            [
                'Steady',
                [buy('2026-09-01', '100', 100000)],
                { '2026-09-30': '10.0000', '2026-10-07': '11.0000' },
            ],
        ]);

        expect(change.from).toBe('2026-09-30');
        expect(change.to).toBe('2026-10-07');
        expect(change.startPaise).toBe(100000);
        expect(change.endPaise).toBe(110000);
        expect(change.netFlowPaise).toBe(0);
        expect(change.marketPaise).toBe(10000);
        expect(change.marketPct).toBe(10);
    });

    it('separates new money from market movement', () => {
        const change = week([
            [
                'Topped up',
                [
                    buy('2026-09-01', '50', 50000),
                    buy('2026-10-05', '50', 60000),
                ],
                {
                    '2026-09-30': '10.0000',
                    '2026-10-05': '12.0000',
                    '2026-10-07': '12.5000',
                },
            ],
        ]);

        expect(change.funds[0]).toMatchObject({
            startPaise: 50000,
            endPaise: 125000,
            netFlowPaise: 60000,
            marketPaise: 15000,
            marketPct: 30,
        });
    });

    it('counts redemption proceeds as money taken out', () => {
        const change = week([
            [
                'Part sold',
                [
                    buy('2026-09-01', '100', 100000),
                    sell('2026-10-06', '40', 44000),
                ],
                {
                    '2026-09-30': '10.0000',
                    '2026-10-06': '11.0000',
                    '2026-10-07': '11.0000',
                },
            ],
        ]);

        expect(change.endPaise).toBe(66000);
        expect(change.netFlowPaise).toBe(-44000);
        expect(change.marketPaise).toBe(10000);
    });

    it('gives a fund bought during the period no market percentage', () => {
        const change = week([
            [
                'New',
                [buy('2026-10-06', '10', 10000)],
                { '2026-10-06': '10.0000', '2026-10-07': '9.0000' },
            ],
        ]);

        expect(change.funds[0]).toMatchObject({
            startPaise: 0,
            marketPaise: -1000,
            marketPct: null,
        });
        expect(change.marketPct).toBeNull();
        expect(change.best).toBeNull();
    });

    it('counts a movement on the start date in the start value', () => {
        const change = week([
            [
                'Bought at start',
                [buy('2026-09-30', '100', 100000)],
                { '2026-09-30': '10.0000', '2026-10-07': '10.5000' },
            ],
        ]);

        expect(change.startPaise).toBe(100000);
        expect(change.netFlowPaise).toBe(0);
        expect(change.marketPaise).toBe(5000);
    });

    it('uses the previous NAV for a start on a weekend or holiday', () => {
        // Week to Sun 11 Oct starts Sun 4 Oct; Fri 2 Oct was a holiday, so Thu 1 Oct's NAV applies.
        const change = changeOver('7d', '2026-10-11', [
            fund([
                'Fund',
                [buy('2026-09-01', '100', 100000)],
                {
                    '2026-10-01': '10.0000',
                    '2026-10-05': '20.0000',
                    '2026-10-09': '30.0000',
                },
            ]),
        ]);

        expect(change.from).toBe('2026-10-04');
        expect(change.startPaise).toBe(100000);
        expect(change.endPaise).toBe(300000);
    });

    it('starts month to date at the previous month end', () => {
        expect(periodStart('month', '2026-10-07')).toBe('2026-09-30');
        expect(periodStart('30d', '2026-10-07')).toBe('2026-09-07');
        expect(periodStart('month', '2026-03-01')).toBe('2026-02-28');
    });

    it('ranks best and worst among funds held at the start', () => {
        const change = week([
            [
                'Up',
                [buy('2026-09-01', '100', 100000)],
                { '2026-09-30': '10.0000', '2026-10-07': '11.0000' },
            ],
            [
                'Down',
                [buy('2026-09-01', '100', 100000)],
                { '2026-09-30': '10.0000', '2026-10-07': '9.5000' },
            ],
            [
                'New',
                [buy('2026-10-06', '100', 100000)],
                { '2026-10-06': '10.0000', '2026-10-07': '15.0000' },
            ],
            [
                'Sold long ago',
                [
                    buy('2026-01-01', '100', 100000),
                    sell('2026-02-01', '100', 100000),
                ],
                { '2026-09-30': '10.0000' },
            ],
        ]);

        expect(change.best?.name).toBe('Up');
        expect(change.worst?.name).toBe('Down');
        // A fund with nothing in the period is left out; largest end value first.
        expect(change.funds).toHaveLength(3);
        expect(change.funds[0]!.name).toBe('New');
    });

    it('includes totals and the period', () => {
        const change = week(
            [
                [
                    'Steady',
                    [buy('2026-09-01', '100', 100000)],
                    { '2026-09-30': '10.0000', '2026-10-07': '11.0000' },
                ],
            ],
            2,
        );

        expect(change.period).toBe('7d');
        expect(change.label).toBe('last 7 days');
        expect(change.marketPaise).toBe(10000);
        expect(change.marketPct).toBe(10);
        expect(change.sipInstallments).toBe(2);
        expect(change.best?.name).toBe('Steady');
        expect(change.worst).toBeNull();
    });
});
