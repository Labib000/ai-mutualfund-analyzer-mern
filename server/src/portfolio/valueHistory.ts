/**
 * Weekly value and FIFO cost of a portfolio, for the value-over-time chart
 * (port of App\Portfolio\ValueHistory).
 */
import type { HistoryPoint } from '@hisaab/shared';

import { addDays } from '../lib/dates.js';
import { Decimal } from '../lib/decimal.js';
import { FifoLots } from './fifoLots.js';
import type { HoldingInput, Movement } from './performance.js';
import { redemptionAmount } from './unitCalculator.js';

const STEP_DAYS = 7;

/** A fund's movements with its NAVs keyed by "YYYY-MM-DD". */
export type HistoryInput = {
    input: HoldingInput;
    navs: Record<string, string>;
};

export function valueHistory(
    holdings: readonly HistoryInput[],
): HistoryPoint[] {
    const dates = sampleDates(holdings);
    if (dates.length === 0) return [];

    const values = new Map(dates.map((d) => [d, 0]));
    const invested = new Map(dates.map((d) => [d, 0]));

    for (const holding of holdings) {
        for (const [date, [value, cost]] of holdingSeries(holding, dates)) {
            values.set(date, values.get(date)! + value);
            invested.set(date, invested.get(date)! + cost);
        }
    }

    return dates.map((date) => ({
        date,
        valuePaise: values.get(date)!,
        investedPaise: invested.get(date)!,
    }));
}

/** Weekly dates ending on the newest NAV date, starting at the first transaction. */
function sampleDates(holdings: readonly HistoryInput[]): string[] {
    let first: string | null = null;
    let last: string | null = null;

    for (const { input } of holdings) {
        for (const movement of input.movements) {
            if (first === null || movement.date < first) first = movement.date;
        }
        if (input.latestNavDate !== null && input.movements.length > 0) {
            if (last === null || input.latestNavDate > last)
                last = input.latestNavDate;
        }
    }

    if (first === null || last === null || last < first) return [];

    const dates = new Set([first]);
    for (let date = last; date > first; date = addDays(date, -STEP_DAYS)) {
        dates.add(date);
    }
    return [...dates].sort();
}

/** Value and FIFO cost of one fund on each sample date, walking forward once. */
function holdingSeries(
    { input, navs }: HistoryInput,
    dates: readonly string[],
): Map<string, [number, number]> {
    // Same-day purchases come before redemptions, as everywhere else.
    const movements: Movement[] = [...input.movements].sort(
        (a, b) =>
            (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
            Number(!a.addsUnits) - Number(!b.addsUnits),
    );
    const navDates = Object.keys(navs).sort();

    const lots = new FifoLots();
    let nextMovement = 0;
    let nextNav = 0;
    let nav: string | null = null;
    const series = new Map<string, [number, number]>();

    for (const date of dates) {
        while (
            nextMovement < movements.length &&
            movements[nextMovement]!.date <= date
        ) {
            const movement = movements[nextMovement++]!;
            if (movement.addsUnits)
                lots.buy(movement.units, movement.amountPaise);
            else lots.sell(movement.units, movement.amountPaise);
        }

        while (nextNav < navDates.length && navDates[nextNav]! <= date) {
            nav = navs[navDates[nextNav++]!]!;
        }

        const units = lots.unitsHeld();
        const value =
            nav !== null &&
            Decimal.isNumeric(nav) &&
            Decimal.compare(units, '0') > 0
                ? redemptionAmount(units, nav)
                : 0;

        series.set(date, [value, lots.costPaise()]);
    }

    return series;
}
