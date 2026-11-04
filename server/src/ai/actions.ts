/**
 * The four AI features (port of App\Actions\Ai\*). Each returns null when
 * there's nothing to explain, so the route can answer 422 without calling the AI.
 */
import { createHash } from 'node:crypto';

import type { AiTurn, ChangePeriod } from '@hisaab/shared';
import type { Types } from 'mongoose';

import { cacheGet, cachePut } from '../lib/cache.js';
import { now } from '../lib/today.js';
import { Sip } from '../models/sip.js';
import { schemeStats } from '../nav/schemeStats.js';
import {
    assetClassFromCategory,
    assetClassLabel,
} from '../portfolio/assetClass.js';
import {
    historyVersion,
    performanceForUser,
    portfolioChanges,
} from '../portfolio/portfolioPerformance.js';
import type { AiContext } from './aiContext.js';
import { changeText } from './changeText.js';
import { fundFactsFull } from './fundFacts.js';
import { contextFor } from './portfolioContext.js';
import {
    EXPLAIN_TASK,
    SYSTEM,
    digestPrompt,
    explainPrompt,
    questionPrompt,
    summaryPrompt,
} from './prompts.js';
import { aiDate } from './text.js';

const DAY_SECONDS = 86_400;
/** Explanations aren't personal, so one per scheme is shared by everyone for a month. */
const EXPLAIN_CACHE_DAYS = 30;

const md5 = (value: string) => createHash('md5').update(value).digest('hex');

type Report = { text: string; generatedAt: string; cached: boolean };
type CachedReport = { version: string; text: string; generatedAt: string };

const userTurn = (content: string) => [{ role: 'user' as const, content }];

/** A plain-language summary, reused until the portfolio changes (or for a day) unless a fresh one is asked for. */
export async function summarisePortfolio(
    ai: AiContext,
    userId: Types.ObjectId,
    fresh = false,
): Promise<Report | null> {
    const { holdings, total } = await performanceForUser(userId);
    if (holdings.length === 0) return null;

    const sips = await Sip.find(
        { holdingId: { $in: holdings.map((h) => h.holdingId) } },
        { updatedAt: 1 },
    )
        .sort({ _id: 1 })
        .lean();
    const version = md5(
        `${historyVersion(holdings)}|${JSON.stringify(sips.map((s) => [String(s._id), s.updatedAt?.toISOString() ?? null]))}|${ai.config.AI_MODEL}`,
    );

    const key = `ai-summary:${String(userId)}`;
    const cached = await cacheGet<CachedReport>(key);
    if (!fresh && cached?.version === version) {
        return {
            text: cached.text,
            generatedAt: cached.generatedAt,
            cached: true,
        };
    }

    const context = (await contextFor(holdings, total)) ?? '';
    const response = await ai.run.handle(userId, 'summary', {
        system: SYSTEM,
        messages: userTurn(summaryPrompt(context)),
        maxOutputTokens: ai.config.AI_MAX_OUTPUT_TOKENS,
    });

    const generatedAt = now().toISOString();
    await cachePut(
        key,
        { version, text: response.text, generatedAt } satisfies CachedReport,
        DAY_SECONDS,
    );
    return { text: response.text, generatedAt, cached: false };
}

/**
 * Answers a question about the portfolio. Earlier turns come from the
 * browser; the current portfolio data rides along with the newest question.
 */
export async function askPortfolio(
    ai: AiContext,
    userId: Types.ObjectId,
    question: string,
    history: AiTurn[] = [],
): Promise<string | null> {
    const { holdings, total } = await performanceForUser(userId);
    const context = await contextFor(holdings, total);
    if (context === null) return null;

    const response = await ai.run.handle(userId, 'ask', {
        system: SYSTEM,
        messages: [...history, ...userTurn(questionPrompt(context, question))],
        maxOutputTokens: ai.config.AI_MAX_OUTPUT_TOKENS,
    });
    return response.text;
}

/** How the portfolio's value changed over the period, reused until the portfolio or its NAVs change. */
export async function digestPortfolio(
    ai: AiContext,
    userId: Types.ObjectId,
    period: ChangePeriod,
): Promise<Report | null> {
    const { holdings } = await performanceForUser(userId);
    const change = (await portfolioChanges(holdings))[period];
    if (!change || change.funds.length === 0) return null;

    const key = `ai-digest:${String(userId)}:${period}`;
    const version = md5(`${historyVersion(holdings)}|${ai.config.AI_MODEL}`);
    const cached = await cacheGet<CachedReport>(key);
    if (cached?.version === version) {
        return {
            text: cached.text,
            generatedAt: cached.generatedAt,
            cached: true,
        };
    }

    const response = await ai.run.handle(userId, 'digest', {
        system: SYSTEM,
        messages: userTurn(digestPrompt(changeText(change))),
        maxOutputTokens: ai.config.AI_MAX_OUTPUT_TOKENS,
    });

    const generatedAt = now().toISOString();
    await cachePut(
        key,
        { version, text: response.text, generatedAt } satisfies CachedReport,
        DAY_SECONDS,
    );
    return { text: response.text, generatedAt, cached: false };
}

export type ExplainScheme = {
    _id: Types.ObjectId;
    name: string;
    amc: string;
    category: string;
    plan?: string | null;
    latestNav?: string | null;
    latestNavDate?: string | null;
    historySyncedAt?: Date | null;
};

async function schemeFacts(scheme: ExplainScheme): Promise<string> {
    const plan =
        scheme.plan === 'direct'
            ? 'Direct'
            : scheme.plan === 'regular'
              ? 'Regular'
              : 'not stated';
    const lines = [
        `Scheme: ${scheme.name}`,
        `Fund house: ${scheme.amc}`,
        `AMFI category: ${scheme.category}`,
        `Asset class: ${assetClassLabel(assetClassFromCategory(scheme.category))}`,
        `Plan: ${plan}`,
    ];
    if (scheme.latestNav && scheme.latestNavDate) {
        lines.push(
            `Latest NAV: ₹${scheme.latestNav} on ${aiDate(scheme.latestNavDate)}`,
        );
    }
    const stats = await schemeStats(scheme);
    lines.push(
        stats === null
            ? 'Past returns: not enough NAV history.'
            : fundFactsFull(stats),
    );
    return lines.join('\n');
}

/** A beginner's explanation of a scheme, cached per scheme and shared by every user. */
export async function explainFund(
    ai: AiContext,
    userId: Types.ObjectId,
    scheme: ExplainScheme,
): Promise<{ text: string; cached: boolean }> {
    const key = `ai-explain:${String(scheme._id)}:${md5(ai.config.AI_MODEL + EXPLAIN_TASK)}`;
    const cached = await cacheGet<string>(key);
    if (typeof cached === 'string') return { text: cached, cached: true };

    const response = await ai.run.handle(userId, 'explain', {
        system: SYSTEM,
        messages: userTurn(explainPrompt(await schemeFacts(scheme))),
        maxOutputTokens: ai.config.AI_MAX_OUTPUT_TOKENS,
    });
    await cachePut(key, response.text, EXPLAIN_CACHE_DAYS * DAY_SECONDS);
    return { text: response.text, cached: false };
}
