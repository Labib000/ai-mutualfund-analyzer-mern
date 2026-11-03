/** Ports of CreateSip, UpdateSip, StopSip, DeleteSip and GenerateSipInstallments. */
import { formatHuman } from '../../lib/dates.js';
import { today as istToday } from '../../lib/today.js';
import { ValidationError } from '../../lib/validationError.js';
import { Holding, type HoldingDoc } from '../../models/holding.js';
import { Scheme } from '../../models/scheme.js';
import { Sip, type SipDoc } from '../../models/sip.js';
import { Transaction } from '../../models/transaction.js';
import { NavProviderError } from '../../nav/navProvider.js';
import { sipDueDates } from '../sipSchedule.js';
import { purchaseUnits, stampDuty } from '../unitCalculator.js';
import { UnitLedger } from '../unitLedger.js';
import {
    type PortfolioContext,
    inTransaction,
    lockHolding,
} from './context.js';

/**
 * Record every installment due up to today whose NAV is published, oldest
 * first. Stops at the first installment still waiting for its NAV; the next
 * run picks it up. Safe to run repeatedly.
 *
 * @returns the number of installments created
 * @throws NavProviderError when the scheme's NAV history can't be fetched
 */
export async function generateSipInstallments(
    ctx: PortfolioContext,
    sipId: SipDoc['_id'],
    today: string = istToday(),
): Promise<number> {
    const sip = await Sip.findById(sipId).lean();
    if (!sip) return 0;

    const holding = await Holding.findById(sip.holdingId).lean();
    const scheme = holding ? await Scheme.findById(holding.schemeId) : null;
    if (!holding || !scheme) return 0;

    // Network calls happen here, before the transaction.
    await ctx.navs.ensureHistory(scheme);

    return inTransaction(async (session) => {
        await lockHolding(holding._id, session);

        const fresh = await Sip.findById(sipId, null, { session }).lean();
        if (!fresh) return 0;

        const dueDates = sipDueDates({
            day: fresh.dayOfMonth,
            start: fresh.startDate,
            end: fresh.endDate ?? null,
            after: fresh.generatedUntil ?? null,
            until: today,
        });

        let generatedUntil = fresh.generatedUntil ?? null;
        const installments = [];

        for (const date of dueDates) {
            const point = await ctx.navs.storedForTransaction(
                scheme._id,
                date,
                session,
            );
            if (point === null) break;

            const duty = stampDuty(fresh.amountPaise);
            installments.push({
                holdingId: holding._id,
                userId: holding.userId,
                sipId: fresh._id,
                type: 'sip_installment' as const,
                txnDate: date,
                navDate: point.date,
                nav: point.nav,
                amountPaise: fresh.amountPaise,
                stampDutyPaise: duty,
                units: purchaseUnits(fresh.amountPaise, duty, point.nav),
                unitsOverridden: false,
            });
            generatedUntil = date;
        }

        if (installments.length > 0) {
            await Transaction.insertMany(installments, { session });
            await Sip.updateOne(
                { _id: fresh._id },
                { $set: { generatedUntil } },
                { session },
            );
        }

        return installments.length;
    });
}

/** Generate installments, logging (not throwing) when the NAV source is down. Returns false then. */
async function tryGenerate(
    ctx: PortfolioContext,
    sip: SipDoc,
): Promise<boolean> {
    try {
        await generateSipInstallments(ctx, sip._id);
        return true;
    } catch (error) {
        if (!(error instanceof NavProviderError)) throw error;
        // The scheduled run will backfill once the NAV source is reachable.
        ctx.logger.error(
            { err: error, sipId: sip.id },
            'SIP installments not generated',
        );
        return false;
    }
}

/**
 * Create a SIP and record its past installments straight away.
 * @returns the SIP, and whether its past installments were recorded
 */
export async function createSip(
    ctx: PortfolioContext,
    holding: HoldingDoc,
    input: {
        amountPaise: number;
        dayOfMonth: number;
        startDate: string;
        endDate: string | null;
    },
): Promise<{ sip: SipDoc; backfilled: boolean }> {
    const sip = await Sip.create({
        holdingId: holding._id,
        userId: holding.userId,
        amountPaise: input.amountPaise,
        dayOfMonth: input.dayOfMonth,
        startDate: input.startDate,
        endDate: input.endDate,
    });

    return { sip, backfilled: await tryGenerate(ctx, sip) };
}

/**
 * Change a SIP's amount, day or end date. Installments already recorded are
 * kept as they are; only future installments use the new values.
 */
export async function updateSip(
    ctx: PortfolioContext,
    sip: SipDoc,
    input: { amountPaise: number; dayOfMonth: number; endDate: string | null },
): Promise<void> {
    sip.set({
        amountPaise: input.amountPaise,
        dayOfMonth: input.dayOfMonth,
        endDate: input.endDate,
    });
    await sip.save();

    await tryGenerate(ctx, sip);
}

/** End the SIP today. Installments up to today stay; none are created after. */
export async function stopSip(sip: SipDoc): Promise<void> {
    const today = istToday();

    if (!sip.endDate || sip.endDate > today) {
        sip.endDate = today > sip.startDate ? today : sip.startDate;
        await sip.save();
    }
}

/**
 * Delete a SIP together with its installments, unless that would leave a
 * redemption selling more units than were held.
 */
export async function deleteSip(sip: SipDoc): Promise<void> {
    await inTransaction(async (session) => {
        await lockHolding(sip.holdingId, session);

        const remaining = await Transaction.find(
            { holdingId: sip.holdingId, sipId: { $ne: sip._id } },
            null,
            { session },
        ).lean();
        const overdrawn =
            UnitLedger.fromTransactions(remaining).firstOverdrawnDate();

        if (overdrawn !== null) {
            throw ValidationError.withMessage(
                'sip',
                `Deleting this SIP and its installments would leave the redemption on ${formatHuman(overdrawn)} with more units than you held.`,
            );
        }

        await Transaction.deleteMany({ sipId: sip._id }, { session });
        await Sip.deleteOne({ _id: sip._id }, { session });
    });
}
