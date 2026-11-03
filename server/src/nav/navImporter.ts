/**
 * Writes parsed AMFI rows into the scheme master and, for tracked schemes,
 * NAV history (port of App\Nav\NavImporter).
 *
 * Unlike Laravel there is no transaction around the import: it touches
 * ~14k schemes, and every write is idempotent, so a re-run repairs a partial one.
 */
import type { AnyBulkWriteOperation } from 'mongoose';

import { addDays } from '../lib/dates.js';
import { now } from '../lib/today.js';
import { NavHistory, type NavHistoryFields } from '../models/navHistory.js';
import { Scheme, type SchemeFields } from '../models/scheme.js';
import {
    AmfiNavFileError,
    type AmfiNavRow,
    isEtf,
} from './amfiNavFileParser.js';

const CHUNK_SIZE = 500;

/** Schemes whose latest NAV is older than this, relative to the file date, are inactive. */
const ACTIVE_WITHIN_DAYS = 30;

export type NavImportResult = {
    /** Newest NAV date in the file, "YYYY-MM-DD". */
    fileDate: string;
    created: number;
    updated: number;
    active: number;
    inactive: number;
    skippedEtfs: number;
    historyAppended: number;
};

function chunks<T>(items: T[], size = CHUNK_SIZE): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
    return out;
}

/** @throws AmfiNavFileError when there are no scheme rows with a NAV date */
export async function importNavs(
    parsed: Iterable<AmfiNavRow>,
): Promise<NavImportResult> {
    const rows: AmfiNavRow[] = [];
    let skippedEtfs = 0;

    for (const row of parsed) {
        if (isEtf(row)) skippedEtfs += 1;
        else rows.push(row);
    }

    const fileDate = newestNavDate(rows);
    const activeSince = addDays(fileDate, -ACTIVE_WITHIN_DAYS);

    const existing = new Set((await Scheme.distinct('amfiCode')) as number[]);

    let created = 0;
    let active = 0;
    const ops: AnyBulkWriteOperation<SchemeFields>[] = [];
    const timestamp = now();

    for (const row of rows) {
        const isActive = row.navDate !== null && row.navDate >= activeSince;
        active += Number(isActive);
        created += Number(!existing.has(row.amfiCode));

        const set: Partial<SchemeFields> = {
            isinGrowth: row.isinGrowth,
            isinReinvestment: row.isinReinvestment,
            name: row.name,
            amc: row.amc,
            schemeType: row.schemeType,
            category: row.category,
            plan: row.plan,
            isActive,
            updatedAt: timestamp,
        };

        // Keep the last known NAV when AMFI publishes "N.A." for a day.
        if (row.nav !== null) {
            set.latestNav = row.nav;
            set.latestNavDate = row.navDate;
        }

        ops.push({
            updateOne: {
                filter: { amfiCode: row.amfiCode },
                update: {
                    $set: set,
                    $setOnInsert: {
                        amfiCode: row.amfiCode,
                        historySyncedAt: null,
                        createdAt: timestamp,
                        ...(row.nav === null
                            ? { latestNav: null, latestNavDate: null }
                            : {}),
                    },
                },
                upsert: true,
            },
        });
    }

    for (const chunk of chunks(ops)) {
        await Scheme.bulkWrite(chunk, { ordered: false, timestamps: false });
    }

    const historyAppended = await appendTrackedHistory(rows);

    return {
        fileDate,
        created,
        updated: rows.length - created,
        active,
        inactive: rows.length - active,
        skippedEtfs,
        historyAppended,
    };
}

/**
 * The newest NAV date in the file. Activity is measured against it rather than
 * today, so a delayed or stale file doesn't mark every scheme inactive.
 */
function newestNavDate(rows: AmfiNavRow[]): string {
    let newest: string | null = null;
    for (const row of rows) {
        if (row.navDate !== null && (newest === null || row.navDate > newest)) {
            newest = row.navDate;
        }
    }

    if (newest === null) {
        throw new AmfiNavFileError(
            'The file has no scheme rows with a NAV date.',
        );
    }

    return newest;
}

/** Record today's NAV for schemes whose history we keep. */
async function appendTrackedHistory(rows: AmfiNavRow[]): Promise<number> {
    const tracked = await Scheme.find(
        { historySyncedAt: { $ne: null } },
        { amfiCode: 1 },
    ).lean();
    const idByCode = new Map(tracked.map((s) => [s.amfiCode, s._id]));

    const docs: NavHistoryFields[] = [];
    for (const row of rows) {
        const schemeId = idByCode.get(row.amfiCode);
        if (row.nav !== null && row.navDate !== null && schemeId) {
            docs.push({ schemeId, navDate: row.navDate, nav: row.nav });
        }
    }

    let appended = 0;
    for (const chunk of chunks(docs)) {
        // Insert-or-ignore: upsert with $setOnInsert never overwrites a stored NAV.
        const result = await NavHistory.bulkWrite(
            chunk.map((doc) => ({
                updateOne: {
                    filter: { schemeId: doc.schemeId, navDate: doc.navDate },
                    update: { $setOnInsert: doc },
                    upsert: true,
                },
            })),
            { ordered: false },
        );
        appended += result.upsertedCount;
    }

    return appended;
}
