/** Ports of AddPurchase, AddRedemption and DeleteTransaction. */
import { formatHuman } from '../../lib/dates.js';
import { Decimal } from '../../lib/decimal.js';
import { ValidationError } from '../../lib/validationError.js';
import type { HoldingDoc } from '../../models/holding.js';
import type { SchemeDoc } from '../../models/scheme.js';
import { Transaction, type TransactionDoc } from '../../models/transaction.js';
import {
    purchaseUnits,
    redemptionAmount,
    stampDuty,
} from '../unitCalculator.js';
import { UnitLedger } from '../unitLedger.js';
import {
    type PortfolioContext,
    inTransaction,
    lockHolding,
} from './context.js';
import { resolveTransactionNav } from './resolveTransactionNav.js';

/**
 * Record a lump-sum purchase. Units are calculated from the applicable NAV
 * after stamp duty, unless the user supplies them from their statement.
 */
export async function addPurchase(
    ctx: PortfolioContext,
    holding: HoldingDoc,
    scheme: SchemeDoc,
    input: { date: string; amountPaise: number; unitsOverride: string | null },
): Promise<TransactionDoc> {
    const point = await resolveTransactionNav(ctx, scheme, input.date);

    const duty = stampDuty(input.amountPaise);
    const units =
        input.unitsOverride ??
        purchaseUnits(input.amountPaise, duty, point.nav);

    if (Decimal.compare(units, '0') <= 0) {
        throw ValidationError.withMessage(
            'amount',
            `This amount buys less than 0.001 units at the NAV of ₹${point.nav}.`,
        );
    }

    return Transaction.create({
        holdingId: holding._id,
        userId: holding.userId,
        type: 'purchase',
        txnDate: input.date,
        navDate: point.date,
        nav: point.nav,
        amountPaise: input.amountPaise,
        stampDutyPaise: duty,
        units,
        unitsOverridden: input.unitsOverride !== null,
    });
}

/**
 * Record a redemption of the given units, or of every unit held on the date
 * when `units` is null. The amount received defaults to units × NAV.
 */
export async function addRedemption(
    ctx: PortfolioContext,
    holding: HoldingDoc,
    scheme: SchemeDoc,
    input: { date: string; units: string | null; amountPaise: number | null },
): Promise<TransactionDoc> {
    // Fetch the NAV before the transaction: it may call the NAV provider.
    const point = await resolveTransactionNav(ctx, scheme, input.date);

    return inTransaction(async (session) => {
        await lockHolding(holding._id, session);

        const existing = await Transaction.find(
            { holdingId: holding._id },
            null,
            { session },
        ).lean();
        const ledger = UnitLedger.fromTransactions(existing);
        const held = ledger.unitsHeldOn(input.date);
        const units = input.units ?? held;

        if (Decimal.compare(units, '0') <= 0) {
            throw ValidationError.withMessage(
                'units',
                `You held no units on ${formatHuman(input.date)}.`,
            );
        }

        const overdrawn = ledger
            .with(input.date, units, false)
            .firstOverdrawnDate();

        if (overdrawn !== null) {
            throw ValidationError.withMessage(
                'units',
                overdrawn === input.date
                    ? `You held only ${held} units on ${formatHuman(input.date)}.`
                    : `This would leave the redemption on ${formatHuman(overdrawn)} with more units than you held.`,
            );
        }

        const [created] = await Transaction.create(
            [
                {
                    holdingId: holding._id,
                    userId: holding.userId,
                    type: 'redemption',
                    txnDate: input.date,
                    navDate: point.date,
                    nav: point.nav,
                    amountPaise:
                        input.amountPaise ?? redemptionAmount(units, point.nav),
                    stampDutyPaise: 0,
                    units,
                    unitsOverridden: false,
                },
            ],
            { session },
        );

        return created!;
    });
}

/**
 * Delete a transaction, unless removing it would leave a later redemption
 * selling more units than were held.
 */
export async function deleteTransaction(
    transaction: TransactionDoc,
): Promise<void> {
    await inTransaction(async (session) => {
        await lockHolding(transaction.holdingId, session);

        const remaining = await Transaction.find(
            { holdingId: transaction.holdingId, _id: { $ne: transaction._id } },
            null,
            { session },
        ).lean();
        const overdrawn =
            UnitLedger.fromTransactions(remaining).firstOverdrawnDate();

        if (overdrawn !== null) {
            throw ValidationError.withMessage(
                'transaction',
                `Deleting this would leave the redemption on ${formatHuman(overdrawn)} with more units than you held.`,
            );
        }

        await Transaction.deleteOne({ _id: transaction._id }, { session });
    });
}
