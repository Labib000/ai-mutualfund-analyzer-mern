/**
 * Money invested and redeemed in each Indian financial year, April to March
 * (port of App\Portfolio\FinancialYears). Used by the AI context in Phase 4.
 */
import type { Movement } from './performance.js';

export type FinancialYear = {
    label: string;
    investedPaise: number;
    redeemedPaise: number;
};

/** 2025 → "FY 2025-26". */
const label = (startYear: number) =>
    `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

/** Oldest first. */
export function financialYears(
    movements: readonly Movement[],
): FinancialYear[] {
    const years = new Map<number, FinancialYear>();

    for (const m of movements) {
        const year = Number(m.date.slice(0, 4));
        const month = Number(m.date.slice(5, 7));
        const start = month >= 4 ? year : year - 1;

        const entry = years.get(start) ?? {
            label: label(start),
            investedPaise: 0,
            redeemedPaise: 0,
        };
        if (m.addsUnits) entry.investedPaise += m.amountPaise;
        else entry.redeemedPaise += m.amountPaise;
        years.set(start, entry);
    }

    return [...years.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, entry]) => entry);
}
