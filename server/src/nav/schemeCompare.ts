/**
 * A scheme's compare-page figures from its stored NAV history, cached per
 * scheme until a newer NAV arrives (like schemeStats). Not in Laravel.
 */
import type { CompareStatsJson } from '@hisaab/shared';
import type { Types } from 'mongoose';

import { cacheGet, cachePut } from '../lib/cache.js';
import { NavHistory } from '../models/navHistory.js';
import { compareStats } from '../portfolio/fundCompare.js';

const TTL_SECONDS = 7 * 24 * 60 * 60;

type SchemeRef = {
    _id: Types.ObjectId;
    latestNavDate?: string | null;
    historySyncedAt?: Date | null;
};

/** @param riskFreeRatePct yearly, e.g. 6.5 */
export async function schemeCompare(
    scheme: SchemeRef,
    riskFreeRatePct: number,
): Promise<CompareStatsJson | null> {
    const key = `scheme-compare:${String(scheme._id)}`;
    const version = `v1|${riskFreeRatePct}|${scheme.latestNavDate ?? ''}|${scheme.historySyncedAt?.toISOString() ?? ''}`;
    const cached = await cacheGet<{
        version: string;
        stats: CompareStatsJson | null;
    }>(key);
    if (cached?.version === version) return cached.stats;

    const rows = await NavHistory.find(
        { schemeId: scheme._id },
        { _id: 0, navDate: 1, nav: 1 },
    ).lean();
    const navs: Record<string, string> = {};
    for (const row of rows) navs[row.navDate] = row.nav;

    const stats = compareStats(navs, riskFreeRatePct / 100);
    await cachePut(key, { version, stats }, TTL_SECONDS);
    return stats;
}
