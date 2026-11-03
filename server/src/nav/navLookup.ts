/**
 * Finds the NAV that applies to a scheme on a date, fetching and caching
 * history on demand (port of App\Nav\NavLookup).
 */
import mongoose, { type ClientSession, type Types } from 'mongoose';

import { addDays, isWeekday } from '../lib/dates.js';
import type { Logger } from '../lib/logger.js';
import { now } from '../lib/today.js';
import { NavHistory } from '../models/navHistory.js';
import { Scheme, type SchemeDoc } from '../models/scheme.js';
import {
    type NavPoint,
    type NavProvider,
    NavProviderError,
} from './navProvider.js';

/** A NAV further than this after the transaction date is treated as not yet published. */
const MAX_NAV_LAG_DAYS = 7;

const CHUNK_SIZE = 500;

export class NavLookup {
    constructor(
        private readonly provider: NavProvider,
        private readonly logger?: Logger,
    ) {}

    /**
     * The NAV a purchase or redemption is processed at: the transaction date's NAV,
     * or the next business day's when the date is a weekend or holiday. Null when
     * that NAV hasn't been published yet.
     *
     * Some funds also publish a NAV on a month-end weekend for accounting.
     * Transactions are never processed at it, so weekend NAVs are skipped here.
     *
     * @throws NavProviderError when the scheme's history can't be fetched
     */
    async forTransaction(
        scheme: SchemeDoc,
        date: string,
    ): Promise<NavPoint | null> {
        await this.ensureHistory(scheme);
        return this.storedForTransaction(scheme._id, date);
    }

    /**
     * forTransaction() from stored history only, with no network call, so it can
     * run inside a Mongo transaction. Call ensureHistory() first.
     */
    async storedForTransaction(
        schemeId: Types.ObjectId,
        date: string,
        session?: ClientSession,
    ): Promise<NavPoint | null> {
        const rows = await NavHistory.find(
            {
                schemeId,
                navDate: { $gte: date, $lte: addDays(date, MAX_NAV_LAG_DAYS) },
            },
            { _id: 0, navDate: 1, nav: 1 },
            { session },
        )
            .sort({ navDate: 1 })
            .lean();

        const row = rows.find((r) => isWeekday(r.navDate));
        return row ? { date: row.navDate, nav: row.nav } : null;
    }

    /**
     * The NAV a holding is worth on a date: the latest published on or before it.
     *
     * @throws NavProviderError when the scheme's history can't be fetched
     */
    async forValuation(
        scheme: SchemeDoc,
        date: string,
    ): Promise<NavPoint | null> {
        await this.ensureHistory(scheme);

        const row = await NavHistory.findOne(
            { schemeId: scheme._id, navDate: { $lte: date } },
            { _id: 0, navDate: 1, nav: 1 },
        )
            .sort({ navDate: -1 })
            .lean();

        return row ? { date: row.navDate, nav: row.nav } : null;
    }

    /**
     * Fetch the full history the first time a scheme is used, then only the
     * missing tail whenever the nightly import has seen a newer NAV than we hold.
     *
     * @throws NavProviderError when the first fetch for a scheme fails
     */
    async ensureHistory(scheme: SchemeDoc): Promise<void> {
        if (
            scheme.historySyncedAt === null ||
            scheme.historySyncedAt === undefined
        ) {
            await this.store(
                scheme,
                await this.provider.history(scheme.amfiCode),
            );
            return;
        }

        const newest = await NavHistory.findOne(
            { schemeId: scheme._id },
            { _id: 0, navDate: 1 },
        )
            .sort({ navDate: -1 })
            .lean();
        const newestStored = newest?.navDate ?? null;

        if (
            !scheme.latestNavDate ||
            (newestStored !== null && newestStored >= scheme.latestNavDate)
        ) {
            return;
        }

        const from = newestStored === null ? null : addDays(newestStored, 1);

        try {
            await this.store(
                scheme,
                await this.provider.history(scheme.amfiCode, from),
            );
        } catch (error) {
            if (!(error instanceof NavProviderError)) throw error;

            // Cached history still answers most lookups; the next call retries the gap.
            this.logger?.warn(
                { amfiCode: scheme.amfiCode, err: error.message },
                'Could not refresh NAV history',
            );
        }
    }

    private async store(scheme: SchemeDoc, navs: NavPoint[]): Promise<void> {
        const syncedAt = now();

        await mongoose.connection.transaction(async (session) => {
            for (let i = 0; i < navs.length; i += CHUNK_SIZE) {
                await NavHistory.bulkWrite(
                    navs.slice(i, i + CHUNK_SIZE).map(({ date, nav }) => ({
                        updateOne: {
                            filter: { schemeId: scheme._id, navDate: date },
                            update: { $set: { nav } },
                            upsert: true,
                        },
                    })),
                    { ordered: false, session },
                );
            }

            await Scheme.updateOne(
                { _id: scheme._id },
                { $set: { historySyncedAt: syncedAt } },
                { session },
            );
        });

        scheme.historySyncedAt = syncedAt;
    }
}
