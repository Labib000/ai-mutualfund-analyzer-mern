import mongoose, { type ClientSession, type Types } from 'mongoose';

import type { Logger } from '../../lib/logger.js';
import { Holding } from '../../models/holding.js';
import type { NavLookup } from '../../nav/navLookup.js';

/** What the portfolio actions need from the app. */
export type PortfolioContext = {
    navs: NavLookup;
    logger: Logger;
};

/**
 * First write of every transaction that checks or changes a holding's units.
 * Two transactions bumping the same holding conflict; the driver retries the
 * loser, which then re-reads fresh data (Laravel's lockForUpdate).
 */
export async function lockHolding(
    holdingId: Types.ObjectId,
    session: ClientSession,
): Promise<void> {
    await Holding.updateOne(
        { _id: holdingId },
        { $inc: { version: 1 } },
        { session },
    );
}

/** Runs `fn` in a Mongo transaction, retried on write conflicts. */
export function inTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
    return mongoose.connection.transaction(fn);
}
