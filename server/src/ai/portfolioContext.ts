/**
 * The portfolio as the AI model sees it: computed figures only. No name,
 * email, IDs or transaction history ever leave the app (port of App\Ai\PortfolioContext).
 */
import {
    type PortfolioChangeJson,
    type XirrStatus,
    formatInr,
} from '@hisaab/shared';
import type { Types } from 'mongoose';

import { today } from '../lib/today.js';
import { Sip, isSipRunningOn } from '../models/sip.js';
import { schemeStats } from '../nav/schemeStats.js';
import { allocationOf } from '../portfolio/allocation.js';
import {
    assetClassFromCategory,
    assetClassLabel,
} from '../portfolio/assetClass.js';
import {
    type FinancialYear,
    financialYears,
} from '../portfolio/financialYears.js';
import { portfolioInsights } from '../portfolio/insights.js';
import {
    type HoldingWithPerformance,
    performanceForUser,
    portfolioChanges,
} from '../portfolio/portfolioPerformance.js';
import type { Performance } from '../portfolio/performance.js';
import { changeText } from './changeText.js';
import { fundFactsShort } from './fundFacts.js';
import { aiDate, numberFormat, signedPercent } from './text.js';

export type ContextFund = {
    name: string;
    category: string;
    assetClass: string;
    investedPaise: number;
    valuePaise: number;
    unrealisedGainPaise: number;
    absoluteReturnPct: number | null;
    realisedGainPaise: number;
    /** A fraction (0.1 = 10%). */
    xirr: number | null;
    xirrStatus: XirrStatus;
    firstInvestment: string | null;
    /** FundFacts' short line. */
    fundStats: string | null;
    sips: { amountPaise: number; day: number }[];
};

export type ContextTotal = Omit<
    ContextFund,
    | 'name'
    | 'category'
    | 'assetClass'
    | 'firstInvestment'
    | 'fundStats'
    | 'sips'
> & {
    valuedOn: string | null;
};

export type ContextExtras = {
    /** Findings of Hisaab's insight rules. */
    observations?: string[];
    /** Cash flow per financial year, oldest first. */
    years?: FinancialYear[];
    change?: PortfolioChangeJson | null;
};

const gain = (paise: number, pct: number | null) =>
    formatInr(paise, true) + (pct === null ? '' : ` (${signedPercent(pct)})`);

function xirr(rate: number | null, status: XirrStatus): string {
    switch (status) {
        case 'ok':
            return `XIRR ${signedPercent((rate ?? 0) * 100)}`;
        case 'short_period':
            return `XIRR ${signedPercent((rate ?? 0) * 100)} (annualised from less than a year, so not yet reliable)`;
        case 'too_recent':
            return 'XIRR not available (investments span less than 30 days)';
        case 'not_meaningful':
            return 'XIRR not available';
    }
}

function fundLine(fund: ContextFund, index: number): string {
    const parts = [`${index + 1}. ${fund.name}`, `category: ${fund.category}`];
    // "Equity Scheme - …" already says the asset class; legacy names may not.
    if (
        !fund.category.toLowerCase().startsWith(fund.assetClass.toLowerCase())
    ) {
        parts.push(`asset class: ${fund.assetClass}`);
    }

    if (
        fund.valuePaise === 0 &&
        fund.investedPaise === 0 &&
        fund.realisedGainPaise !== 0
    ) {
        parts.push(
            `fully redeemed, realised gain ${formatInr(fund.realisedGainPaise, true)}`,
        );
    } else {
        parts.push(`invested ${formatInr(fund.investedPaise)}`);
        parts.push(`current value ${formatInr(fund.valuePaise)}`);
        parts.push(
            `unrealised gain ${gain(fund.unrealisedGainPaise, fund.absoluteReturnPct)}`,
        );
        if (fund.realisedGainPaise !== 0)
            parts.push(
                `realised gain ${formatInr(fund.realisedGainPaise, true)}`,
            );
    }

    parts.push(xirr(fund.xirr, fund.xirrStatus));
    if (fund.fundStats !== null) parts.push(fund.fundStats);
    if (fund.firstInvestment !== null)
        parts.push(`investing since ${aiDate(fund.firstInvestment)}`);
    parts.push(
        fund.sips.length === 0
            ? 'no running SIP'
            : `running SIP: ${fund.sips.map((s) => `${formatInr(s.amountPaise)} monthly on day ${s.day}`).join(' and ')}`,
    );
    return parts.join(' | ');
}

export function renderContext(
    funds: readonly ContextFund[],
    total: ContextTotal,
    classes: readonly { label: string; pct: number }[],
    { observations = [], years = [], change = null }: ContextExtras = {},
): string {
    const lines: string[] = [];
    lines.push(
        `Values in Indian rupees${total.valuedOn ? `, at NAVs up to ${aiDate(total.valuedOn)}` : ''}.`,
    );
    lines.push('');
    lines.push(
        `TOTAL: invested ${formatInr(total.investedPaise)}` +
            `; current value ${formatInr(total.valuePaise)}` +
            `; unrealised gain ${gain(total.unrealisedGainPaise, total.absoluteReturnPct)}` +
            `; realised gain on redemptions ${formatInr(total.realisedGainPaise, true)}` +
            `; ${xirr(total.xirr, total.xirrStatus)}.`,
    );
    if (classes.length > 0) {
        lines.push(
            `ALLOCATION BY ASSET CLASS: ${classes.map((c) => `${c.label} ${numberFormat(c.pct, 1)}%`).join(', ')}.`,
        );
    }

    lines.push('');
    lines.push(`FUNDS (${funds.length}):`);
    funds.forEach((fund, i) => lines.push(fundLine(fund, i)));

    if (years.length > 0) {
        lines.push('');
        lines.push(
            `CASH FLOW BY FINANCIAL YEAR (April to March): ${years
                .map(
                    (y) =>
                        `${y.label} invested ${formatInr(y.investedPaise)}` +
                        (y.redeemedPaise > 0
                            ? `, redeemed ${formatInr(y.redeemedPaise)}`
                            : ''),
                )
                .join('; ')}.`,
        );
    }

    if (change && change.funds.length > 0) {
        lines.push('');
        lines.push(changeText(change, false));
    }

    if (observations.length > 0) {
        lines.push('');
        lines.push("OBSERVATIONS (found by Hisaab's rules):");
        for (const o of observations) lines.push(`- ${o}`);
    }

    return lines.join('\n');
}

const totals = (p: Performance) => ({
    investedPaise: p.investedPaise,
    valuePaise: p.valuePaise,
    unrealisedGainPaise: p.unrealisedGainPaise,
    absoluteReturnPct: p.absoluteReturnPct,
    realisedGainPaise: p.realisedGainPaise,
    xirr: p.xirr,
    xirrStatus: p.xirrStatus,
});

/** Renders already-loaded holdings; null when there are none. */
export async function contextFor(
    holdings: readonly HoldingWithPerformance[],
    total: Performance,
): Promise<string | null> {
    if (holdings.length === 0) return null;

    const day = today();
    const sips = await Sip.find(
        { holdingId: { $in: holdings.map((h) => h.holdingId) } },
        {
            holdingId: 1,
            amountPaise: 1,
            dayOfMonth: 1,
            endDate: 1,
            startDate: 1,
        },
    )
        .sort({ startDate: 1, _id: 1 })
        .lean();

    const byValue = [...holdings].sort(
        (a, b) => b.performance.valuePaise - a.performance.valuePaise,
    );
    const funds: ContextFund[] = [];
    for (const h of byValue) {
        const stats = await schemeStats(h.scheme);
        const first = h.input.movements.reduce<string | null>(
            (min, m) => (min === null || m.date < min ? m.date : min),
            null,
        );
        funds.push({
            name: h.scheme.name,
            category: h.scheme.category,
            assetClass: assetClassLabel(
                assetClassFromCategory(h.scheme.category),
            ),
            ...totals(h.performance),
            firstInvestment: first,
            fundStats: stats === null ? null : fundFactsShort(stats),
            sips: sips
                .filter(
                    (s) =>
                        String(s.holdingId) === String(h.holdingId) &&
                        isSipRunningOn(s, day),
                )
                .map((s) => ({
                    amountPaise: s.amountPaise,
                    day: s.dayOfMonth,
                })),
        });
    }

    const allocation = allocationOf(
        holdings.map((h) => ({
            category: h.scheme.category,
            valuePaise: h.performance.valuePaise,
        })),
    );
    const insights = await portfolioInsights(holdings, total.xirrStatus, day);
    const changes = await portfolioChanges(holdings);

    return renderContext(
        funds,
        { ...totals(total), valuedOn: total.valuedOn },
        allocation.classes,
        {
            observations: insights.map((i) => `${i.title}. ${i.detail}`),
            years: financialYears(holdings.flatMap((h) => h.input.movements)),
            // Laravel's ChangePeriod::Month is the last 30 days.
            change: changes['30d'] ?? null,
        },
    );
}

/** The user's portfolio as text, or null when they hold no funds yet. */
export async function contextForUser(
    userId: Types.ObjectId,
): Promise<string | null> {
    const { holdings, total } = await performanceForUser(userId);
    return contextFor(holdings, total);
}
