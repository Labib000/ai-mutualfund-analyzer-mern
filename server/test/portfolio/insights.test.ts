import type { XirrStatus } from '@hisaab/shared';
import { describe, expect, it } from 'vitest';

import {
    type Insight,
    type InsightFund,
    insightsOf,
} from '../../src/portfolio/insights.js';

// Port of tests/Unit/Portfolio/InsightsTest.php
const TODAY = '2026-10-08';

type Options = Partial<{
    name: string;
    amc: string;
    category: string;
    plan: InsightFund['plan'];
    invested: number;
    value: number;
    last: string;
    sip: boolean;
}>;

const fund = (o: Options = {}): InsightFund => ({
    name: o.name ?? 'Test Fund - Direct Plan - Growth',
    amc: o.amc ?? 'Test Mutual Fund',
    category: o.category ?? 'Equity Scheme - Flexi Cap Fund',
    plan: 'plan' in o ? o.plan! : 'direct',
    investedPaise: o.invested ?? 100000,
    valuePaise: Math.trunc(o.value ?? 110000),
    lastTransaction: o.last ?? '2026-09-01',
    hasRunningSip: o.sip ?? false,
});

const insight = (list: Insight[], code: string) =>
    list.find((i) => i.code === code) ?? null;

function find(
    code: string,
    funds: InsightFund[],
    xirr: XirrStatus = 'ok',
): Insight {
    const found = insight(insightsOf(funds, xirr, TODAY), code);
    expect(found, `Expected a [${code}] insight.`).not.toBeNull();
    return found!;
}

const notFound = (code: string, funds: InsightFund[]) =>
    expect(insight(insightsOf(funds, 'ok', TODAY), code)).toBeNull();

describe('insightsOf', () => {
    it('names a fund below its cost with its loss', () => {
        const i = find('loss', [
            fund({
                name: 'Axis Small Cap Fund - Direct Plan - Growth',
                invested: 1000000,
                value: 950000,
            }),
        ]);

        expect(i.tone).toBe('attention');
        expect(i.title).toBe('Axis Small Cap Fund is below its cost');
        expect(i.detail).toBe(
            'Its current value is ₹500.00 (5.0%) less than the cost of the units held.',
        );
        expect(i.question).toBe('Why is Axis Small Cap Fund below its cost?');
    });

    it('lists several losing funds together', () => {
        const i = find('loss', [
            fund({ name: 'A Fund - Direct', value: 90000 }),
            fund({ name: 'B Fund - Direct', value: 80000 }),
            fund({ name: 'C Fund - Direct', value: 120000 }),
        ]);

        expect(i.title).toBe('2 funds are below their cost');
        expect(i.detail).toContain('A Fund and B Fund');
    });

    it('does not count a fund at cost as a loss', () => {
        notFound('loss', [fund({ invested: 100000, value: 100000 })]);
    });

    it('explains Regular plans as a fact', () => {
        const i = find('regular_plan', [
            fund({
                name: 'HDFC Top 100 Fund - Regular Plan - Growth',
                plan: 'regular',
            }),
        ]);

        expect(i.title).toBe('HDFC Top 100 Fund is a Regular plan');
        expect(i.detail).toContain('distributor commission');
        expect(i.detail.toLowerCase()).not.toContain('switch');

        notFound('regular_plan', [fund({ plan: 'direct' })]);
    });

    it('calls out one fund above forty percent', () => {
        const i = find('fund_concentration', [
            fund({ name: 'Big Fund - Direct', value: 410000, amc: 'X' }),
            fund({ value: 590000 / 2, amc: 'Y' }),
            fund({ value: 590000 / 2, amc: 'Z' }),
        ]);

        expect(i.title).toBe('Big Fund is 41.0% of your portfolio');
    });

    it('does not call out exactly forty percent', () => {
        notFound('fund_concentration', [
            fund({ value: 400000, amc: 'X' }),
            fund({ value: 300000, amc: 'Y' }),
            fund({ value: 300000, amc: 'Z' }),
        ]);
    });

    it('does not treat a single fund as a concentration', () => {
        notFound('fund_concentration', [fund()]);
        notFound('amc_concentration', [fund()]);
    });

    it('calls out one fund house above half', () => {
        const i = find('amc_concentration', [
            fund({ value: 260000, amc: 'Axis Mutual Fund' }),
            fund({ value: 250001, amc: 'Axis Mutual Fund' }),
            fund({ value: 489999, amc: 'HDFC Mutual Fund' }),
        ]);

        expect(i.title).toBe('51.0% of your money is with Axis Mutual Fund');

        notFound('amc_concentration', [
            fund({ value: 500000, amc: 'Axis Mutual Fund' }),
            fund({ value: 500000, amc: 'HDFC Mutual Fund' }),
        ]);
    });

    it('says so when all funds are from one house', () => {
        const i = find('amc_concentration', [
            fund({ amc: 'Axis Mutual Fund' }),
            fund({ amc: 'Axis Mutual Fund' }),
        ]);
        expect(i.title).toBe('All your funds are from Axis Mutual Fund');
    });

    it('describes a single asset class', () => {
        const i = find('single_asset_class', [
            fund(),
            fund({ category: 'Equity Scheme - Small Cap Fund' }),
        ]);
        expect(i.title).toBe('All your money is in Equity funds');

        notFound('single_asset_class', [
            fund(),
            fund({ category: 'Debt Scheme - Liquid Fund' }),
        ]);
    });

    it('groups funds sharing a category', () => {
        const i = find('same_category', [
            fund({
                name: 'A Large Cap Fund - Direct',
                category: 'Equity Scheme - Large Cap Fund',
            }),
            fund({
                name: 'B Large Cap Fund - Direct',
                category: 'Equity Scheme - Large Cap Fund',
            }),
            fund({ category: 'Equity Scheme - Small Cap Fund' }),
        ]);

        expect(i.title).toBe('2 funds in Large Cap Fund');
        expect(
            i.detail.startsWith(
                'A Large Cap Fund and B Large Cap Fund are in the same category',
            ),
        ).toBe(true);
    });

    it('marks a fund without a SIP or transaction for a year as idle', () => {
        const i = find('idle', [
            fund({ name: 'Old Fund - Direct', last: '2025-10-07', sip: false }),
        ]);
        expect(i.title).toBe('No new money in Old Fund for over a year');

        // Exactly a year is not idle yet; a running SIP keeps it active.
        notFound('idle', [fund({ last: '2025-10-08', sip: false })]);
        notFound('idle', [fund({ last: '2020-01-01', sip: true })]);
    });

    it('mentions a short XIRR history', () => {
        expect(find('short_history', [fund()], 'short_period').title).toBe(
            'Your XIRR covers less than a year',
        );
        expect(find('short_history', [fund()], 'too_recent').title).toBe(
            'XIRR appears after 30 days',
        );
        notFound('short_history', [fund()]);
    });

    it('puts attention first and ignores redeemed funds', () => {
        const list = insightsOf(
            [
                fund({ plan: 'regular', invested: 100000, value: 90000 }),
                fund({
                    name: 'Sold Fund - Direct',
                    invested: 0,
                    value: 0,
                    plan: 'regular',
                }),
            ],
            'ok',
            TODAY,
        );

        expect(list[0]!.code).toBe('loss');
        expect(insight(list, 'regular_plan')?.title).toBe(
            'Test Fund is a Regular plan',
        );
    });

    it('has no insights for an empty portfolio', () => {
        expect(insightsOf([], 'not_meaningful', TODAY)).toEqual([]);
    });

    it('keeps fund house names that come first in a scheme name', () => {
        // Laravel kept only "UTI" here.
        const i = find('loss', [
            fund({
                name: 'UTI - Nifty Next 50 Index Fund - Direct Plan - Growth',
                value: 90000,
            }),
        ]);
        expect(i.title).toBe('UTI Nifty Next 50 Index Fund is below its cost');
    });
});
