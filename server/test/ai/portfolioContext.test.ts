import type { ChangeFundJson, PortfolioChangeJson } from '@hisaab/shared';
import { describe, expect, it } from 'vitest';

import {
    type ContextFund,
    type ContextTotal,
    renderContext,
} from '../../src/ai/portfolioContext.js';

// Port of tests/Unit/Ai/PortfolioContextTest.php

function fund(overrides: Partial<ContextFund> = {}): ContextFund {
    return {
        name: 'Test Fund',
        category: 'Equity Scheme - Flexi Cap Fund',
        assetClass: 'Equity',
        investedPaise: 100000,
        valuePaise: 110000,
        unrealisedGainPaise: 10000,
        absoluteReturnPct: 10.0,
        realisedGainPaise: 0,
        xirr: 0.1,
        xirrStatus: 'ok',
        firstInvestment: null,
        fundStats: null,
        sips: [],
        ...overrides,
    };
}

function total(overrides: Partial<ContextTotal> = {}): ContextTotal {
    return {
        investedPaise: 0,
        valuePaise: 0,
        unrealisedGainPaise: 0,
        absoluteReturnPct: null,
        realisedGainPaise: 250000,
        xirr: null,
        xirrStatus: 'not_meaningful',
        valuedOn: null,
        ...overrides,
    };
}

/** A ChangeFund as Laravel builds it: market = end − start − flow, pct against the start. */
function changeFund(
    name: string,
    startPaise: number,
    endPaise: number,
    netFlowPaise: number,
): ChangeFundJson {
    const marketPaise = endPaise - startPaise - netFlowPaise;
    return {
        name,
        startPaise,
        endPaise,
        netFlowPaise,
        marketPaise,
        marketPct: startPaise > 0 ? (marketPaise / startPaise) * 100 : null,
    };
}

function change(
    from: string,
    to: string,
    funds: ChangeFundJson[],
    sipInstallments: number,
): PortfolioChangeJson {
    const sum = (f: (x: ChangeFundJson) => number) =>
        funds.reduce((s, x) => s + f(x), 0);
    const startPaise = sum((f) => f.startPaise);
    const marketPaise = sum((f) => f.marketPaise);
    const held = funds
        .filter((f) => f.startPaise > 0)
        .sort((a, b) => (b.marketPct ?? 0) - (a.marketPct ?? 0));
    return {
        period: '30d',
        label: 'last 30 days',
        from,
        to,
        startPaise,
        endPaise: sum((f) => f.endPaise),
        netFlowPaise: sum((f) => f.netFlowPaise),
        marketPaise,
        marketPct: startPaise > 0 ? (marketPaise / startPaise) * 100 : null,
        sipInstallments,
        best: held[0] ?? null,
        worst: held.length >= 2 ? held.at(-1)! : null,
        funds,
    };
}

describe('renderContext', () => {
    it('renders totals, allocation and each fund', () => {
        const text = renderContext(
            [
                fund({
                    name: "Axis Children's Fund - Direct Plan - Growth Option",
                    investedPaise: 4500000,
                    valuePaise: 4488392,
                    unrealisedGainPaise: -11608,
                    absoluteReturnPct: -0.258,
                    xirr: -0.0073,
                    xirrStatus: 'short_period',
                    firstInvestment: '2026-01-31',
                    fundStats: 'fund NAV return 1y +21.7%; volatility 14.2%',
                    sips: [{ amountPaise: 500000, day: 31 }],
                }),
                fund({
                    name: 'Parag Parikh Liquid Fund - Direct Plan - Growth',
                    category: 'Debt Scheme - Liquid Fund',
                    assetClass: 'Debt',
                    xirr: 0.0674,
                    xirrStatus: 'ok',
                }),
            ],
            {
                investedPaise: 6500000,
                valuePaise: 6568204,
                unrealisedGainPaise: 68204,
                absoluteReturnPct: 1.049,
                realisedGainPaise: 0,
                xirr: 0.0246,
                xirrStatus: 'short_period',
                valuedOn: '2026-10-07',
            },
            [
                { label: 'Solution oriented', pct: 68.34 },
                { label: 'Debt', pct: 31.66 },
            ],
        );

        expect(text).toContain(
            'Values in Indian rupees, at NAVs up to 7 Oct 2026.',
        );
        expect(text).toContain(
            'TOTAL: invested ₹65,000.00; current value ₹65,682.04; unrealised gain +₹682.04 (+1.05%)',
        );
        expect(text).toContain(
            'XIRR +2.46% (annualised from less than a year, so not yet reliable)',
        );
        expect(text).toContain(
            'ALLOCATION BY ASSET CLASS: Solution oriented 68.3%, Debt 31.7%.',
        );
        expect(text).toContain('FUNDS (2):');
        expect(text).toContain(
            "1. Axis Children's Fund - Direct Plan - Growth Option | category: Equity Scheme - Flexi Cap Fund",
        );
        expect(text).toContain('unrealised gain −₹116.08 (−0.26%)');
        expect(text).toContain(
            'XIRR −0.73% (annualised from less than a year, so not yet reliable) | fund NAV return 1y +21.7%; volatility 14.2% | investing since',
        );
        expect(text).toContain(
            'investing since 31 Jan 2026 | running SIP: ₹5,000.00 monthly on day 31',
        );
        expect(text).toContain(
            '2. Parag Parikh Liquid Fund - Direct Plan - Growth | category: Debt Scheme - Liquid Fund | invested',
        );
        expect(text).toContain('XIRR +6.74% | ');
        expect(text).toContain('no running SIP');
    });

    it("names the asset class only when the category doesn't say it", () => {
        const legacy = renderContext(
            [fund({ category: 'Growth', assetClass: 'Equity' })],
            total(),
            [],
        );
        expect(legacy).toContain('category: Growth | asset class: Equity |');
        expect(renderContext([fund()], total(), [])).not.toContain(
            'asset class:',
        );
    });

    it('shows the realised gain of a fully redeemed fund', () => {
        const text = renderContext(
            [
                fund({
                    investedPaise: 0,
                    valuePaise: 0,
                    unrealisedGainPaise: 0,
                    absoluteReturnPct: null,
                    realisedGainPaise: 250000,
                }),
            ],
            total(),
            [],
        );
        expect(text).toContain('fully redeemed, realised gain +₹2,500.00');
        expect(text).not.toContain('ALLOCATION');
    });

    it('lists observations after the funds', () => {
        const text = renderContext([fund()], total(), [], {
            observations: [
                'Test Fund is a Regular plan. Regular plans include a distributor commission.',
            ],
        });
        expect(
            text.endsWith(
                "OBSERVATIONS (found by Hisaab's rules):\n- Test Fund is a Regular plan. Regular plans include a distributor commission.",
            ),
        ).toBe(true);
        expect(renderContext([fund()], total(), [])).not.toContain(
            'OBSERVATIONS',
        );
    });

    it('puts cash flow by financial year on one line', () => {
        const text = renderContext([fund()], total(), [], {
            years: [
                {
                    label: 'FY 2025-26',
                    investedPaise: 6000000,
                    redeemedPaise: 0,
                },
                {
                    label: 'FY 2026-27',
                    investedPaise: 3000000,
                    redeemedPaise: 1050000,
                },
            ],
        });
        expect(text).toContain(
            'CASH FLOW BY FINANCIAL YEAR (April to March): FY 2025-26 invested ₹60,000.00; FY 2026-27 invested ₹30,000.00, redeemed ₹10,500.00.',
        );
    });

    it('shows the recent change with totals and only the biggest movers', () => {
        const text = renderContext([fund()], total(), [], {
            change: change(
                '2026-09-07',
                '2026-10-07',
                [
                    changeFund('Up Fund - Direct', 100000, 110000, 0),
                    changeFund('Flat Fund - Direct', 100000, 100000, 0),
                    changeFund('Down Fund - Direct', 100000, 95000, 0),
                ],
                1,
            ),
        });
        expect(text).toContain(
            'CHANGE OVER THE LAST 30 DAYS (7 Sep 2026 to 7 Oct 2026): value ₹3,000.00 → ₹3,050.00; new money in (purchases and SIPs minus redemptions) ₹0.00; market movement +₹50.00 (+1.67%); SIP installments recorded: 1.',
        );
        expect(text).toContain(
            '- Moved most: Up Fund - Direct: market movement +₹100.00 (+10.00%)',
        );
        expect(text).toContain(
            '- Moved least: Down Fund - Direct: market movement −₹50.00 (−5.00%)',
        );
        expect(text).not.toContain('Flat Fund');
    });

    it('keeps a large portfolio within the token budget', () => {
        const name = (i: number) =>
            `Aditya Birla Sun Life Equity Hybrid '95 Fund ${i} - Direct Plan - Growth Option`;
        const funds: ContextFund[] = [];
        const changeFunds: ChangeFundJson[] = [];
        for (let i = 1; i <= 20; i++) {
            funds.push(
                fund({
                    name: name(i),
                    category: 'Hybrid Scheme - Aggressive Hybrid Fund',
                    assetClass: 'Hybrid',
                    investedPaise: 123456789,
                    valuePaise: 234567890,
                    unrealisedGainPaise: 111111101,
                    absoluteReturnPct: 90.0,
                    realisedGainPaise: 1234567,
                    firstInvestment: '2016-04-05',
                    fundStats:
                        'fund NAV return 1y +21.7%, 3y +15.2% p.a., 5y +18.9% p.a.; volatility 14.2%; largest fall −38.5%',
                    sips: [
                        { amountPaise: 1000000, day: 5 },
                        { amountPaise: 500000, day: 31 },
                    ],
                }),
            );
            changeFunds.push(
                changeFund(name(i), 230000000, 234567890, 1500000),
            );
        }
        const years = [];
        for (let year = 2016; year <= 2026; year++) {
            years.push({
                label: `FY ${year}-${String((year + 1) % 100).padStart(2, '0')}`,
                investedPaise: 18000000,
                redeemedPaise: 2500000,
            });
        }

        const text = renderContext(
            funds,
            total({
                investedPaise: 2469135780,
                valuePaise: 4691357800,
                valuedOn: '2026-10-07',
            }),
            [{ label: 'Hybrid', pct: 100.0 }],
            {
                observations: Array(8).fill(
                    'An observation about the portfolio with some detail. '.repeat(
                        4,
                    ),
                ),
                years,
                change: change('2026-09-07', '2026-10-07', changeFunds, 40),
            },
        );

        // About 4 characters a token: even this large portfolio stays near 3.2K
        // tokens, leaving room for the system prompt, chat history and answer
        // within Groq's free-tier limit of about 8K tokens a minute.
        expect(text.length).toBeLessThan(13000);
    });

    it('explains XIRR that is not shown', () => {
        const recent = renderContext(
            [fund({ xirr: null, xirrStatus: 'too_recent' })],
            total(),
            [],
        );
        expect(recent).toContain(
            'XIRR not available (investments span less than 30 days)',
        );
    });
});
