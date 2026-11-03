/**
 * SIP projections for the calculator page. Illustrative maths in rupees
 * (floats), using the common Indian convention: each installment is paid at
 * the start of the month, then a month's return (annual rate / 12) is added.
 */

export type SipInput = {
    /** Monthly installment in the first year, ₹. */
    monthly: number;
    /** Expected annual return, % (e.g. 12). */
    annualReturnPct: number;
    years: number;
    /** Installment increase every 12 months, % (0 for a flat SIP). */
    stepUpPct?: number;
};

export type YearPoint = {
    year: number;
    /** Installment paid each month during this year, ₹. */
    monthly: number;
    /** Total paid in by the end of this year, ₹. */
    invested: number;
    /** Value at the end of this year, ₹. */
    value: number;
};

export type SipProjection = {
    invested: number;
    value: number;
    gain: number;
    /** value ÷ invested. */
    multiplier: number;
    series: YearPoint[];
};

export function projectSip({
    monthly,
    annualReturnPct,
    years,
    stepUpPct = 0,
}: SipInput): SipProjection {
    const rate = annualReturnPct / 100 / 12;
    let installment = monthly;
    let invested = 0;
    let value = 0;
    const series: YearPoint[] = [];

    for (let year = 1; year <= years; year++) {
        if (year > 1) installment *= 1 + stepUpPct / 100;
        for (let month = 0; month < 12; month++) {
            invested += installment;
            value = (value + installment) * (1 + rate);
        }
        series.push({
            year,
            monthly: Math.round(installment),
            invested: Math.round(invested),
            value: Math.round(value),
        });
    }

    const roundedInvested = Math.round(invested);
    const roundedValue = Math.round(value);

    return {
        invested: roundedInvested,
        value: roundedValue,
        gain: roundedValue - roundedInvested,
        multiplier: roundedInvested > 0 ? roundedValue / roundedInvested : 0,
        series,
    };
}

/** Monthly SIP (first year) needed to reach `target`, rounded up to the next ₹100. */
export function requiredMonthly({
    target,
    annualReturnPct,
    years,
    stepUpPct = 0,
}: Omit<SipInput, 'monthly'> & { target: number }): number {
    // The value grows in proportion to the installment, so solve with ₹1.
    let value = 0;
    let installment = 1;
    const rate = annualReturnPct / 100 / 12;
    for (let year = 1; year <= years; year++) {
        if (year > 1) installment *= 1 + stepUpPct / 100;
        for (let month = 0; month < 12; month++) {
            value = (value + installment) * (1 + rate);
        }
    }
    return value > 0 ? Math.ceil(target / value / 100) * 100 : 0;
}

/** What `value` received in `years` is worth in today's money. */
export function realValue(
    value: number,
    inflationPct: number,
    years: number,
): number {
    return Math.round(value / (1 + inflationPct / 100) ** years);
}

export type Milestone = {
    label: string;
    year: number;
    kind: 'corpus' | 'overtake' | 'halfway';
    /** Value reached that year, ₹. */
    value: number;
};

const CORPUS_MARKS = [
    [10_00_000, '₹10 L'],
    [25_00_000, '₹25 L'],
    [50_00_000, '₹50 L'],
    [1_00_00_000, '₹1 Cr'],
    [2_00_00_000, '₹2 Cr'],
    [5_00_00_000, '₹5 Cr'],
    [10_00_00_000, '₹10 Cr'],
] as const;

/**
 * Years in which the plan crosses round amounts, and the year returns first
 * exceed the money put in. At most `limit`, in year order.
 */
export function milestones(
    series: readonly YearPoint[],
    limit = 5,
): Milestone[] {
    const found: Milestone[] = [];

    for (const [amount, label] of CORPUS_MARKS) {
        const point = series.find((p) => p.value >= amount);
        if (point) {
            found.push({
                label: `Crosses ${label}`,
                year: point.year,
                kind: 'corpus',
                value: point.value,
            });
        }
    }

    const overtake = series.find((p) => p.value - p.invested > p.invested);
    if (overtake) {
        found.push({
            label: 'Returns overtake what you put in',
            year: overtake.year,
            kind: 'overtake',
            value: overtake.value,
        });
    }

    // Short plans cross few round amounts: mark the halfway year instead.
    if (found.length < 2 && series.length >= 2) {
        const half = series[Math.floor(series.length / 2) - 1];
        if (!found.some((m) => m.year === half.year)) {
            found.push({
                label: 'Halfway there',
                year: half.year,
                kind: 'halfway',
                value: half.value,
            });
        }
    }

    found.sort((a, b) => a.year - b.year);
    // Keep the latest marks when there are too many: they're the interesting ones.
    return found.length > limit ? found.slice(found.length - limit) : found;
}
