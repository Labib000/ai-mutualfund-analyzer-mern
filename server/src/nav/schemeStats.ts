/**
 * A scheme's past returns and risk from its stored NAV history, cached per
 * scheme until a newer NAV arrives (port of App\Nav\SchemeStats).
 */
import type { FundStatsJson } from '@hisaab/shared';
import type { Types } from 'mongoose';

import { cacheGet, cachePut } from '../lib/cache.js';
import { NavHistory } from '../models/navHistory.js';
import { fundStats, fundStatsJson } from '../portfolio/fundStats.js';

const TTL_SECONDS = 7 * 24 * 60 * 60;

type SchemeRef = {
    _id: Types.ObjectId;
    latestNavDate?: string | null;
    historySyncedAt?: Date | null;
};

export async function schemeStats(
    scheme: SchemeRef,
): Promise<FundStatsJson | null> {
    // One entry per scheme, replaced when the NAV history grows.
    const key = `scheme-stats:${String(scheme._id)}`;
    // "v2": face-value changes are adjusted for; recompute stats cached before that.
    const version = `v2|${scheme.latestNavDate ?? ''}|${scheme.historySyncedAt?.toISOString() ?? ''}`;
    const cached = await cacheGet<{
        version: string;
        stats: FundStatsJson | null;
    }>(key);
    if (cached?.version === version) return cached.stats;

    // Plain rows: a decade-old fund has ~2,700 NAVs.
    const rows = await NavHistory.find(
        { schemeId: scheme._id },
        { _id: 0, navDate: 1, nav: 1 },
    ).lean();
    const navs: Record<string, string> = {};
    for (const row of rows) navs[row.navDate] = row.nav;

    const result = fundStats(navs);
    const stats = result === null ? null : fundStatsJson(result);
    await cachePut(key, { version, stats }, TTL_SECONDS);
    return stats;
}
