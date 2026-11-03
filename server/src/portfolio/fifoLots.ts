/**
 * Tracks purchase lots so redemptions sell the oldest units first, giving the
 * cost of units still held and the gain realised on units sold
 * (port of App\Portfolio\FifoLots).
 *
 * Callers add movements in date order, purchases before redemptions on the same day.
 */
import { Decimal } from '../lib/decimal.js';
import { UNITS_SCALE } from './unitCalculator.js';

/** Selling more units than are held. */
export class OversellError extends Error {
    override name = 'OversellError';
}

type Lot = { units: string; cost: number };

export class FifoLots {
    private lots: Lot[] = [];
    private realised = 0;
    // Running totals, so reading them doesn't re-add every lot.
    private held = '0';
    private cost = 0;

    buy(units: string, costPaise: number): void {
        this.lots.push({ units, cost: costPaise });
        this.held = Decimal.add(this.held, units, UNITS_SCALE);
        this.cost += costPaise;
    }

    /** @throws OversellError when selling more units than are held */
    sell(units: string, proceedsPaise: number): void {
        let remaining = units;
        let costRemoved = 0;

        while (Decimal.compare(remaining, '0') > 0) {
            const lot = this.lots[0];

            if (!lot) {
                throw new OversellError(
                    `Cannot sell ${units} units: only part of them are held.`,
                );
            }

            if (Decimal.compare(lot.units, remaining) <= 0) {
                // The whole lot goes, with exactly its remaining cost, so rounding never accumulates.
                costRemoved += lot.cost;
                remaining = Decimal.sub(remaining, lot.units, UNITS_SCALE);
                this.lots.shift();
                continue;
            }

            const cost = Number(
                Decimal.round(
                    Decimal.div(
                        Decimal.mul(String(lot.cost), remaining, 6),
                        lot.units,
                        6,
                    ),
                    0,
                ),
            );
            this.lots[0] = {
                units: Decimal.sub(lot.units, remaining, UNITS_SCALE),
                cost: lot.cost - cost,
            };
            costRemoved += cost;
            remaining = '0';
        }

        this.realised += proceedsPaise - costRemoved;
        this.held = Decimal.sub(this.held, units, UNITS_SCALE);
        this.cost -= costRemoved;
    }

    unitsHeld(): string {
        return Decimal.add(this.held, '0', UNITS_SCALE);
    }

    /** Cost of the units still held, in paise. */
    costPaise(): number {
        return this.cost;
    }

    /** Proceeds of redemptions minus the cost of the units they sold, in paise. */
    realisedGainPaise(): number {
        return this.realised;
    }
}
