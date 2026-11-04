/** Holdings, transactions and SIPs (port of the Portfolio controllers). */
import type { AiContext } from '../ai/aiContext.js';
import { explainHandler } from './ai.js';
import {
    type HoldingCreatedResponse,
    type HoldingDetailResponse,
    type HoldingListResponse,
    type MessageResponse,
    holdingCreateSchema,
    isIsoDate,
    purchaseSchema,
    redemptionSchema,
    sipCreateSchema,
    sipUpdateSchema,
} from '@hisaab/shared';
import { Router } from 'express';

import { today } from '../lib/today.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import {
    loadHolding,
    loadSip,
    loadTransaction,
} from '../middleware/ownership.js';
import {
    parseOr422,
    parseWithOr422,
    sendValidationErrors,
} from '../middleware/validate.js';
import { Holding } from '../models/holding.js';
import { Scheme, type SchemeDoc } from '../models/scheme.js';
import { Sip } from '../models/sip.js';
import { Transaction } from '../models/transaction.js';
import {
    type PortfolioContext,
    inTransaction,
} from '../portfolio/actions/context.js';
import {
    createSip,
    deleteSip,
    stopSip,
    updateSip,
} from '../portfolio/actions/sips.js';
import {
    addPurchase,
    addRedemption,
    deleteTransaction,
} from '../portfolio/actions/transactions.js';
import { schemeStats } from '../nav/schemeStats.js';
import {
    performanceForHolding,
    performanceForUser,
} from '../portfolio/portfolioPerformance.js';
import {
    schemeSummary,
    sipJson,
    transactionJson,
} from '../portfolio/presenters.js';

/** before_or_equal:today, for a raw "YYYY-MM-DD" field. */
const futureDateError = (value: unknown) =>
    typeof value === 'string' && isIsoDate(value) && value > today()
        ? 'The date cannot be in the future.'
        : null;

const isDuplicateKey = (error: unknown) =>
    (error as { code?: number })?.code === 11000;

export function holdingsRouter(ctx: PortfolioContext, ai: AiContext): Router {
    const router = Router();

    router.use(requireAuth, requireVerified);

    /** List the user's funds with their returns and the portfolio total. */
    router.get('/', async (req, res) => {
        const { holdings, total } = await performanceForUser(req.user!._id);

        res.json({
            holdings: holdings.map((h) => ({
                id: String(h.holdingId),
                scheme: schemeSummary(h.scheme),
                performance: h.performance.toJSON(),
            })),
            summary: total.toJSON(),
        } satisfies HoldingListResponse);
    });

    /** Add a scheme to the user's portfolio. */
    router.post('/', async (req, res) => {
        const input = parseOr422(holdingCreateSchema, req.body, res);
        if (!input) return;

        const scheme = await Scheme.exists({
            _id: input.scheme_id,
            isActive: true,
        });
        if (!scheme) {
            sendValidationErrors(res, {
                scheme_id: 'This fund is no longer active.',
            });
            return;
        }

        const alreadyHeld = 'This fund is already in your portfolio.';
        if (
            await Holding.exists({
                userId: req.user!._id,
                schemeId: input.scheme_id,
            })
        ) {
            sendValidationErrors(res, { scheme_id: alreadyHeld });
            return;
        }

        try {
            const holding = await Holding.create({
                userId: req.user!._id,
                schemeId: input.scheme_id,
            });

            res.status(201).json({
                holding: { id: holding.id as string },
                message: 'Fund added. Now record a purchase or a SIP.',
            } satisfies HoldingCreatedResponse);
        } catch (error) {
            if (!isDuplicateKey(error)) throw error;
            sendValidationErrors(res, { scheme_id: alreadyHeld });
        }
    });

    // Everything below is limited to the holding's owner.
    const holding = Router({ mergeParams: true });
    router.use('/:holdingId', loadHolding, holding);

    /** A beginner's explanation of the fund's scheme (AI, cached per scheme). */
    holding.post('/explain', ...explainHandler(ai));

    const schemeOf = async (schemeId: unknown): Promise<SchemeDoc> => {
        const scheme = await Scheme.findById(schemeId);
        if (!scheme) throw new Error(`Scheme ${String(schemeId)} is missing`);
        return scheme;
    };

    /** One fund with its transactions and SIPs. */
    holding.get('/', async (req, res) => {
        const h = req.holding!;
        const now = today();
        const scheme = await Scheme.findById(h.schemeId).lean();
        if (!scheme) throw new Error(`Scheme ${String(h.schemeId)} is missing`);

        const [performance, transactions, sips] = await Promise.all([
            performanceForHolding(h._id, scheme),
            Transaction.find({ holdingId: h._id })
                .sort({ txnDate: -1, _id: -1 })
                .lean(),
            Sip.find({ holdingId: h._id })
                .sort({ startDate: 1, _id: 1 })
                .lean(),
        ]);

        res.json({
            holding: {
                id: h.id as string,
                scheme: schemeSummary(scheme),
                performance: performance.toJSON(),
            },
            transactions: transactions.map(transactionJson),
            sips: sips.map((sip) => sipJson(sip, now)),
            today: now,
            fundStats: await schemeStats(scheme),
        } satisfies HoldingDetailResponse);
    });

    /** Remove a fund with all its transactions and SIPs. */
    holding.delete('/', async (req, res) => {
        const id = req.holding!._id;

        await inTransaction(async (session) => {
            await Transaction.deleteMany({ holdingId: id }, { session });
            await Sip.deleteMany({ holdingId: id }, { session });
            await Holding.deleteOne({ _id: id }, { session });
        });

        res.json({
            message: 'Fund removed from your portfolio.',
        } satisfies MessageResponse);
    });

    /** Record a lump-sum purchase. */
    holding.post('/purchases', async (req, res) => {
        const input = parseWithOr422(purchaseSchema, req.body, res, {
            txn_date: futureDateError(req.body?.txn_date),
        });
        if (!input) return;

        const transaction = await addPurchase(
            ctx,
            req.holding!,
            await schemeOf(req.holding!.schemeId),
            {
                date: input.txn_date,
                amountPaise: input.amount,
                unitsOverride: input.units,
            },
        );

        res.status(201).json({
            message: `Purchase recorded: ${transaction.units} units.`,
        } satisfies MessageResponse);
    });

    /** Record a redemption. */
    holding.post('/redemptions', async (req, res) => {
        const input = parseWithOr422(redemptionSchema, req.body, res, {
            txn_date: futureDateError(req.body?.txn_date),
        });
        if (!input) return;

        const transaction = await addRedemption(
            ctx,
            req.holding!,
            await schemeOf(req.holding!.schemeId),
            {
                date: input.txn_date,
                units: input.units,
                amountPaise: input.amount,
            },
        );

        res.status(201).json({
            message: `Redemption recorded: ${transaction.units} units.`,
        } satisfies MessageResponse);
    });

    holding.delete(
        '/transactions/:transactionId',
        loadTransaction,
        async (req, res) => {
            await deleteTransaction(req.transaction!);

            res.json({
                message: 'Transaction deleted.',
            } satisfies MessageResponse);
        },
    );

    /** Start a SIP, recording any installments already due. */
    holding.post('/sips', async (req, res) => {
        const input = parseOr422(sipCreateSchema, req.body, res);
        if (!input) return;

        const { sip, backfilled } = await createSip(ctx, req.holding!, {
            amountPaise: input.amount,
            dayOfMonth: input.day_of_month,
            startDate: input.start_date,
            endDate: input.end_date,
        });

        if (!backfilled) {
            res.status(201).json({
                message:
                    "SIP added. Past installments couldn't be recorded right now and will be added automatically.",
                warning: true,
            } satisfies MessageResponse);
            return;
        }

        const count = await Transaction.countDocuments({ sipId: sip._id });
        const past =
            count > 0
                ? ` with ${count} past installment${count === 1 ? '' : 's'}`
                : '';

        res.status(201).json({
            message: `SIP added${past}.`,
        } satisfies MessageResponse);
    });

    /** Change a SIP's amount, day or end date for future installments. */
    holding.patch('/sips/:sipId', loadSip, async (req, res) => {
        const sip = req.sip!;
        // The end date can't fall before installments that already exist.
        const earliestEnd = sip.generatedUntil ?? sip.startDate;
        const rawEnd: unknown = req.body?.end_date;

        const input = parseWithOr422(sipUpdateSchema, req.body, res, {
            end_date:
                typeof rawEnd === 'string' &&
                isIsoDate(rawEnd) &&
                rawEnd < earliestEnd
                    ? 'The end date cannot be before an installment that has already been recorded.'
                    : null,
        });
        if (!input) return;

        await updateSip(ctx, sip, {
            amountPaise: input.amount,
            dayOfMonth: input.day_of_month,
            endDate: input.end_date,
        });

        res.json({
            message: 'SIP updated. Recorded installments are unchanged.',
        } satisfies MessageResponse);
    });

    /** Stop a SIP from today. */
    holding.post('/sips/:sipId/stop', loadSip, async (req, res) => {
        await stopSip(req.sip!);

        res.json({ message: 'SIP stopped.' } satisfies MessageResponse);
    });

    /** Delete a SIP and its installments. */
    holding.delete('/sips/:sipId', loadSip, async (req, res) => {
        await deleteSip(req.sip!);

        res.json({
            message: 'SIP and its installments deleted.',
        } satisfies MessageResponse);
    });

    return router;
}
