/**
 * Replays a holding's unit movements to answer "how many units did I hold on
 * this date?" and "does the balance ever go negative?" (port of App\Portfolio\UnitLedger).
 *
 * On the same day, purchases count before redemptions, so units bought and
 * sold on one day are valid.
 */
import { type TransactionType, addsUnits } from '@hisaab/shared';

import { Decimal } from '../lib/decimal.js';
import { UNITS_SCALE } from './unitCalculator.js';

type Entry = { date: string; delta: string };

export class UnitLedger {
    private constructor(private readonly entries: readonly Entry[] = []) {}

    static empty(): UnitLedger {
        return new UnitLedger();
    }

    static fromTransactions(
        transactions: Iterable<{
            txnDate: string;
            units: string;
            type: TransactionType;
        }>,
    ): UnitLedger {
        let ledger = UnitLedger.empty();
        for (const t of transactions) {
            ledger = ledger.with(t.txnDate, t.units, addsUnits(t.type));
        }
        return ledger;
    }

    /** A copy of the ledger with one more movement (`date` is "YYYY-MM-DD"). */
    with(date: string, units: string, adds: boolean): UnitLedger {
        if (!Decimal.isNumeric(units) || Decimal.compare(units, '0') < 0) {
            throw new RangeError(
                `Units must be a non-negative decimal, got [${units}].`,
            );
        }

        const delta = adds ? units : Decimal.mul(units, '-1', UNITS_SCALE);
        return new UnitLedger([...this.entries, { date, delta }]);
    }

    /** Units held at the end of the given day. */
    unitsHeldOn(date: string): string {
        let balance = '0';
        for (const entry of this.entries) {
            if (entry.date <= date) {
                balance = Decimal.add(balance, entry.delta, UNITS_SCALE);
            }
        }
        return Decimal.add(balance, '0', UNITS_SCALE);
    }

    /** The first date on which more units were redeemed than held, or null if the balance never goes negative. */
    firstOverdrawnDate(): string | null {
        // By date, then purchases before redemptions on the same day.
        const entries = [...this.entries].sort((a, b) =>
            a.date !== b.date
                ? a.date < b.date
                    ? -1
                    : 1
                : Decimal.compare(b.delta, '0') - Decimal.compare(a.delta, '0'),
        );

        let balance = '0';
        for (const entry of entries) {
            balance = Decimal.add(balance, entry.delta, UNITS_SCALE);
            if (Decimal.compare(balance, '0') < 0) return entry.date;
        }
        return null;
    }
}
