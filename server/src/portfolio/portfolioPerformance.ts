/**
 * Loads a user's holdings and works out their performance and value history
 * (port of App\Portfolio\PortfolioPerformance).
 */
import { createHash } from 'node:crypto';

import { type HistoryPoint, addsUnits } from '@hisaab/shared';
import type { Types } from 'mongoose';

import { cacheGet, cachePut } from '../lib/cache.js';
import { addDays } from '../lib/dates.js';

import { Holding } from '../models/holding.js';
import { NavHistory } from '../models/navHistory.js';
import { Scheme, type SchemeFields } from '../models/scheme.js';
import { Transaction } from '../models/transaction.js';
import type { HoldingInput, Performance } from './performance.js';
import {
    holdingPerformance,
    portfolioPerformance,
} from './performanceCalculator.js';
import { type HistoryInput, valueHistory } from './valueHistory.js';

type LeanScheme = SchemeFields & { _id: Types.ObjectId };

export type HoldingWithPerformance = {
    holdingId: Types.ObjectId;
    scheme: LeanScheme;
    input: HoldingInput;
    performance: Performance;
    /** What the value history depends on, for its cache version. */
    fingerprint: Fingerprint;
};

/** Transaction count, newest id and newest update; changes with any add, delete or edit. */
type Fingerprint = [
    count: number,
    maxId: string | null,
    maxUpdatedAt: string | null,
];

const MOVEMENT_FIELDS = {
    holdingId: 1,
    type: 1,
    txnDate: 1,
    units: 1,
    amountPaise: 1,
    updatedAt: 1,
};

async function inputsFor(
    holdingIds: Types.ObjectId[],
    schemes: Map<string, LeanScheme>,
    schemeOf: Map<string, string>,
): Promise<Map<string, { input: HoldingInput; fingerprint: Fingerprint }>> {
    const transactions = await Transaction.find(
        { holdingId: { $in: holdingIds } },
        MOVEMENT_FIELDS,
    ).lean();

    const movements = new Map<string, HoldingInput['movements'][number][]>();
    const fingerprints = new Map<string, Fingerprint>();
    for (const id of holdingIds) {
        movements.set(String(id), []);
        fingerprints.set(String(id), [0, null, null]);
    }

    for (const t of transactions) {
        const fp = fingerprints.get(String(t.holdingId));
        if (fp) {
            const id = String(t._id);
            const updated = t.updatedAt ? t.updatedAt.toISOString() : null;
            fp[0]++;
            if (fp[1] === null || id > fp[1]) fp[1] = id;
            if (updated !== null && (fp[2] === null || updated > fp[2]))
                fp[2] = updated;
        }
        movements.get(String(t.holdingId))?.push({
            date: t.txnDate,
            addsUnits: addsUnits(t.type),
            units: t.units,
            amountPaise: t.amountPaise,
        });
    }

    const inputs = new Map<
        string,
        { input: HoldingInput; fingerprint: Fingerprint }
    >();
    for (const id of holdingIds) {
        const scheme = schemes.get(schemeOf.get(String(id))!)!;
        inputs.set(String(id), {
            input: {
                movements: movements.get(String(id))!,
                latestNav: scheme.latestNav ?? null,
                latestNavDate: scheme.latestNavDate ?? null,
            },
            fingerprint: fingerprints.get(String(id))!,
        });
    }
    return inputs;
}

/** Every holding of the user with its performance (sorted by fund name), plus the portfolio total. */
export async function performanceForUser(userId: Types.ObjectId): Promise<{
    holdings: HoldingWithPerformance[];
    total: Performance;
}> {
    const holdings = await Holding.find({ userId }, { schemeId: 1 }).lean();
    const schemeList = await Scheme.find({
        _id: { $in: holdings.map((h) => h.schemeId) },
    }).lean();

    const schemes = new Map(schemeList.map((s) => [String(s._id), s]));
    const schemeOf = new Map(
        holdings.map((h) => [String(h._id), String(h.schemeId)]),
    );
    const inputs = await inputsFor(
        holdings.map((h) => h._id),
        schemes,
        schemeOf,
    );

    const rows = holdings
        .map((h) => {
            const { input, fingerprint } = inputs.get(String(h._id))!;
            return {
                holdingId: h._id,
                scheme: schemes.get(String(h.schemeId))!,
                input,
                performance: holdingPerformance(input),
                fingerprint,
            };
        })
        .sort((a, b) => a.scheme.name.localeCompare(b.scheme.name, 'en'));

    return {
        holdings: rows,
        total: portfolioPerformance(rows.map((r) => r.input)),
    };
}

export async function performanceForHolding(
    holdingId: Types.ObjectId,
    scheme: LeanScheme,
): Promise<Performance> {
    const inputs = await inputsFor(
        [holdingId],
        new Map([[String(scheme._id), scheme]]),
        new Map([[String(holdingId), String(scheme._id)]]),
    );
    return holdingPerformance(inputs.get(String(holdingId))!.input);
}

const HISTORY_TTL_SECONDS = 86_400;

/**
 * Changes whenever the history could: a transaction added, deleted or edited,
 * or a newer NAV imported.
 */
export function historyVersion(
    holdings: readonly HoldingWithPerformance[],
): string {
    const parts = [...holdings]
        .sort((a, b) => (String(a.holdingId) < String(b.holdingId) ? -1 : 1))
        .map((h) => [
            String(h.holdingId),
            h.scheme.latestNavDate ?? null,
            ...h.fingerprint,
        ]);
    return createHash('md5').update(JSON.stringify(parts)).digest('hex');
}

/**
 * Weekly value history, cached per user. One entry per user, replaced
 * whenever its version changes, so stale series never pile up.
 */
export async function portfolioHistory(
    userId: Types.ObjectId,
    holdings: readonly HoldingWithPerformance[],
): Promise<HistoryPoint[]> {
    if (holdings.length === 0) return [];

    const key = `portfolio-history:${String(userId)}`;
    const version = historyVersion(holdings);
    const cached = await cacheGet<{ version: string; series: HistoryPoint[] }>(
        key,
    );
    if (cached?.version === version) return cached.series;

    const series = await computeHistory(holdings);
    await cachePut(key, { version, series }, HISTORY_TTL_SECONDS);
    return series;
}

async function computeHistory(
    holdings: readonly HoldingWithPerformance[],
): Promise<HistoryPoint[]> {
    let first: string | null = null;
    for (const { input } of holdings) {
        for (const m of input.movements) {
            if (first === null || m.date < first) first = m.date;
        }
    }
    if (first === null) return [];

    const navs = await navsFrom(holdings, first);
    return valueHistory(
        holdings.map((h): HistoryInput => ({
            input: h.input,
            navs: navs.get(String(h.holdingId))!,
        })),
    );
}

/** NAVs per holding from `from` on, keyed by date. */
async function navsFrom(
    holdings: readonly HoldingWithPerformance[],
    from: string,
): Promise<Map<string, Record<string, string>>> {
    const schemeIds = [
        ...new Map(
            holdings.map((h) => [String(h.scheme._id), h.scheme._id]),
        ).values(),
    ];
    // The extra days cover a start date that falls on a weekend or holiday.
    const rows = await NavHistory.find(
        { schemeId: { $in: schemeIds }, navDate: { $gte: addDays(from, -10) } },
        { _id: 0, schemeId: 1, navDate: 1, nav: 1 },
    ).lean();

    const byScheme = new Map<string, Record<string, string>>();
    for (const row of rows) {
        const navs = byScheme.get(String(row.schemeId)) ?? {};
        navs[row.navDate] = row.nav;
        byScheme.set(String(row.schemeId), navs);
    }

    const navs = new Map<string, Record<string, string>>();
    for (const h of holdings) {
        const own = { ...byScheme.get(String(h.scheme._id)) };
        // The scheme's latest NAV, in case today's import hasn't reached navHistory.
        if (h.scheme.latestNav && h.scheme.latestNavDate) {
            own[h.scheme.latestNavDate] = h.scheme.latestNav;
        }
        navs.set(String(h.holdingId), own);
    }
    return navs;
}
