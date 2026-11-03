import { formatHuman } from '../../lib/dates.js';
import { today } from '../../lib/today.js';
import { ValidationError } from '../../lib/validationError.js';
import type { SchemeDoc } from '../../models/scheme.js';
import { type NavPoint, NavProviderError } from '../../nav/navProvider.js';
import type { PortfolioContext } from './context.js';

/** The NAV a transaction on `date` is processed at, or a 422 on `field` explaining why there is none. */
export async function resolveTransactionNav(
    ctx: PortfolioContext,
    scheme: SchemeDoc,
    date: string,
    field = 'txn_date',
): Promise<NavPoint> {
    let point: NavPoint | null;

    try {
        point = await ctx.navs.forTransaction(scheme, date);
    } catch (error) {
        if (!(error instanceof NavProviderError)) throw error;

        ctx.logger.error(
            { err: error, amfiCode: scheme.amfiCode },
            'NAV lookup failed',
        );
        throw ValidationError.withMessage(
            field,
            "Couldn't fetch NAV history right now, please try again.",
        );
    }

    if (point === null) {
        throw ValidationError.withMessage(
            field,
            date === today()
                ? "Today's NAV isn't published yet. Add this after 11 PM IST or tomorrow."
                : `No NAV is available for ${formatHuman(date)}.`,
        );
    }

    return point;
}
