/**
 * Factual observations about a portfolio, found by fixed rules so they can be
 * shown without AI and tested exactly. They describe; they never advise.
 * Port of App\Portfolio\Insights, Insight, InsightFund and PortfolioInsights.
 */
import {
    type InsightJson,
    type SchemePlan,
    type XirrStatus,
    assetClassFromCategory,
    assetClassLabel,
    formatInr,
    shortSchemeName,
} from '@hisaab/shared';
import type { Types } from 'mongoose';

import { addYearsOverflow } from '../lib/dates.js';
import { roundFloat } from '../lib/decimal.js';
import { Sip, isSipRunningOn } from '../models/sip.js';
import type { HoldingWithPerformance } from './portfolioPerformance.js';

/** A single fund above this share of value is called out. */
export const FUND_SHARE = 0.4;

/** A single fund house above this share of value is called out. */
export const AMC_SHARE = 0.5;

/** A fund with no SIP and no transaction for this long counts as idle. */
export const IDLE_MONTHS = 12;

/** What the rules need to know about one fund. */
export type InsightFund = {
    name: string;
    amc: string;
    category: string;
    plan: SchemePlan | null;
    investedPaise: number;
    valuePaise: number;
    /** "YYYY-MM-DD", or null with no transactions. */
    lastTransaction: string | null;
    hasRunningSip: boolean;
};

/** An insight with the question the user could ask the AI about it (Phase 4; not sent to the browser). */
export type Insight = InsightJson & { question?: string };

const short = (f: InsightFund) => shortSchemeName(f.name);

/** "A, B and C". */
function names(funds: readonly InsightFund[]): string {
    const list = funds.map(short);
    const last = list.pop()!;
    return list.length === 0 ? last : `${list.join(', ')} and ${last}`;
}

/** 0.41 → "41.0%", like PHP's number_format(…, 1). */
const pct = (fraction: number) =>
    `${roundFloat(fraction * 100, 1).toFixed(1)}%`;

/** Attention first, then information. */
export function insightsOf(
    funds: readonly InsightFund[],
    portfolioXirr: XirrStatus,
    today: string,
): Insight[] {
    const held = funds.filter((f) => f.valuePaise > 0);
    const total = held.reduce((sum, f) => sum + f.valuePaise, 0);
    if (total === 0) return [];

    const found = [
        losses(held),
        regularPlans(held),
        fundConcentration(held, total),
        amcConcentration(held, total),
        singleAssetClass(held),
        ...sameCategory(held),
        idle(held, today),
        shortHistory(portfolioXirr),
    ].filter((i): i is Insight => i !== null);

    // A stable sort keeps the rules' order within each tone.
    return found.sort(
        (a, b) =>
            (a.tone === 'attention' ? 0 : 1) - (b.tone === 'attention' ? 0 : 1),
    );
}

function losses(held: InsightFund[]): Insight | null {
    const losing = held.filter((f) => f.valuePaise < f.investedPaise);
    if (losing.length === 0) return null;

    if (losing.length === 1) {
        const fund = losing[0]!;
        const loss = fund.investedPaise - fund.valuePaise;
        return {
            code: 'loss',
            tone: 'attention',
            title: `${short(fund)} is below its cost`,
            detail: `Its current value is ${formatInr(loss)} (${pct(loss / fund.investedPaise)}) less than the cost of the units held.`,
            question: `Why is ${short(fund)} below its cost?`,
        };
    }

    return {
        code: 'loss',
        tone: 'attention',
        title: `${losing.length} funds are below their cost`,
        detail: `Current value is less than the cost of the units held in ${names(losing)}.`,
        question: 'Why are some of my funds below their cost?',
    };
}

function regularPlans(held: InsightFund[]): Insight | null {
    const regular = held.filter((f) => f.plan === 'regular');
    if (regular.length === 0) return null;

    return {
        code: 'regular_plan',
        tone: 'info',
        title:
            regular.length === 1
                ? `${short(regular[0]!)} is a Regular plan`
                : `${regular.length} funds are Regular plans`,
        detail: 'Regular plans include a distributor commission, so their expense ratio is higher than the Direct plan of the same scheme.',
        question: 'What is the difference between Direct and Regular plans?',
    };
}

function fundConcentration(held: InsightFund[], total: number): Insight | null {
    if (held.length < 2) return null;

    const biggest = [...held].sort((a, b) => b.valuePaise - a.valuePaise)[0]!;
    const share = biggest.valuePaise / total;
    if (share <= FUND_SHARE) return null;

    return {
        code: 'fund_concentration',
        tone: 'info',
        title: `${short(biggest)} is ${pct(share)} of your portfolio`,
        detail: 'With this much in one fund, its ups and downs largely decide how your whole portfolio moves.',
        question: `What does having so much in ${short(biggest)} mean for my portfolio?`,
    };
}

function amcConcentration(held: InsightFund[], total: number): Insight | null {
    if (held.length < 2) return null;

    const byAmc = new Map<string, number>();
    for (const f of held)
        byAmc.set(f.amc, (byAmc.get(f.amc) ?? 0) + f.valuePaise);

    // Largest first; ties keep the first fund house seen, like PHP's arsort.
    const [amc, value] = [...byAmc].sort((a, b) => b[1] - a[1])[0]!;
    const share = value / total;
    if (share <= AMC_SHARE) return null;

    return {
        code: 'amc_concentration',
        tone: 'info',
        title:
            byAmc.size === 1
                ? `All your funds are from ${amc}`
                : `${pct(share)} of your money is with ${amc}`,
        detail: 'Funds from one fund house are run under the same investment process and policies.',
        question: 'What does having most of my money with one fund house mean?',
    };
}

function singleAssetClass(held: InsightFund[]): Insight | null {
    const classes = new Set(
        held.map((f) => assetClassFromCategory(f.category)),
    );
    if (classes.size !== 1) return null;

    const [key] = classes;
    const label = assetClassLabel(key!);
    const detail =
        key === 'equity'
            ? 'Equity funds follow the stock market, so their value can rise and fall sharply over short periods.'
            : key === 'debt'
              ? 'Debt funds lend to governments and companies; their value moves with interest rates and credit quality.'
              : `Your portfolio's ups and downs follow how ${label} funds behave.`;

    return {
        code: 'single_asset_class',
        tone: 'info',
        title: `All your money is in ${label} funds`,
        detail,
        question: `What does having all my money in ${label} funds mean?`,
    };
}

function sameCategory(held: InsightFund[]): Insight[] {
    const byCategory = new Map<string, InsightFund[]>();
    for (const f of held)
        byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f]);

    const found: Insight[] = [];
    for (const [category, funds] of byCategory) {
        if (funds.length < 2) continue;

        const at = category.indexOf(' - ');
        const label = at === -1 ? category : category.slice(at + 3);
        found.push({
            code: 'same_category',
            tone: 'info',
            title: `${funds.length} funds in ${label}`,
            detail: `${names(funds)} are in the same category, so they often invest in many of the same securities.`,
            question: `What does holding ${funds.length} funds in ${label} mean?`,
        });
    }
    return found;
}

function idle(held: InsightFund[], today: string): Insight | null {
    const cutoff = addYearsOverflow(today, -IDLE_MONTHS / 12);
    const idleFunds = held.filter(
        (f) =>
            !f.hasRunningSip &&
            f.lastTransaction !== null &&
            f.lastTransaction < cutoff,
    );
    if (idleFunds.length === 0) return null;

    const one = idleFunds.length === 1;
    return {
        code: 'idle',
        tone: 'info',
        title: one
            ? `No new money in ${short(idleFunds[0]!)} for over a year`
            : `${idleFunds.length} funds had no new money for over a year`,
        detail: one
            ? `It has no running SIP and no transaction in the last ${IDLE_MONTHS} months.`
            : `${names(idleFunds)} have no running SIP and no transaction in the last ${IDLE_MONTHS} months.`,
    };
}

function shortHistory(status: XirrStatus): Insight | null {
    switch (status) {
        case 'short_period':
            return {
                code: 'short_history',
                tone: 'info',
                title: 'Your XIRR covers less than a year',
                detail: 'An annualised return from a short period can swing a lot; it settles as your investments age.',
                question: 'Why is my XIRR not reliable yet?',
            };
        case 'too_recent':
            return {
                code: 'short_history',
                tone: 'info',
                title: 'XIRR appears after 30 days',
                detail: 'Your investments span less than 30 days, too short for a meaningful annual return.',
            };
        default:
            return null;
    }
}

/** For the API: the AI question stays on the server, as in Laravel's toArray(). */
export const insightJson = ({
    code,
    tone,
    title,
    detail,
}: Insight): InsightJson => ({ code, tone, title, detail });

/** Builds the rules' input from a user's holdings (port of PortfolioInsights). */
export async function portfolioInsights(
    holdings: readonly HoldingWithPerformance[],
    portfolioXirr: XirrStatus,
    today: string,
): Promise<Insight[]> {
    const sips = await Sip.find(
        { holdingId: { $in: holdings.map((h) => h.holdingId) } },
        { holdingId: 1, endDate: 1 },
    ).lean();
    const running = new Set(
        sips
            .filter((sip) => isSipRunningOn(sip, today))
            .map((sip) => String(sip.holdingId as Types.ObjectId)),
    );

    return insightsOf(
        holdings.map((h) => ({
            name: h.scheme.name,
            amc: h.scheme.amc,
            category: h.scheme.category,
            plan: (h.scheme.plan ?? null) as SchemePlan | null,
            investedPaise: h.performance.investedPaise,
            valuePaise: h.performance.valuePaise,
            lastTransaction: h.input.movements.reduce<string | null>(
                (last, m) => (last === null || m.date > last ? m.date : last),
                null,
            ),
            hasRunningSip: running.has(String(h.holdingId)),
        })),
        portfolioXirr,
        today,
    );
}
