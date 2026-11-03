/**
 * The sips-generate job (port of the sips:generate command): record SIP
 * installments whose NAV is now published. Runs after each NAV import.
 */
import { withJobLock } from '../lib/jobLock.js';
import { today as istToday } from '../lib/today.js';
import { Sip, sipsDueBy } from '../models/sip.js';
import { NavProviderError } from '../nav/navProvider.js';
import type { PortfolioContext } from '../portfolio/actions/context.js';
import { generateSipInstallments } from '../portfolio/actions/sips.js';

export type SipsGenerateResult = {
    /** Installments recorded. */
    created: number;
    /** SIPs whose NAV history couldn't be fetched; the next run retries them. */
    failed: number;
};

const LOCK_MINUTES = 30;

/** @throws JobLockedError when another run holds the lock */
export function runSipsGenerate(
    ctx: PortfolioContext,
    today: string = istToday(),
): Promise<SipsGenerateResult> {
    return withJobLock('sips-generate', LOCK_MINUTES, async () => {
        let created = 0;
        let failed = 0;

        const due = Sip.find(sipsDueBy(today), { _id: 1 })
            .sort({ _id: 1 })
            .lean()
            .cursor();

        for await (const sip of due) {
            try {
                created += await generateSipInstallments(ctx, sip._id, today);
            } catch (error) {
                if (!(error instanceof NavProviderError)) throw error;

                // One unreachable scheme shouldn't block the others.
                ctx.logger.error(
                    { err: error, sipId: String(sip._id) },
                    'SIP generation failed',
                );
                failed += 1;
            }
        }

        return { created, failed };
    });
}
