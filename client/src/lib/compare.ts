/** Pure helpers for the fund compare page. */
import { COMPARE_MAX_FUNDS } from '@hisaab/shared';

export type Period = '1y' | '3y' | '5y' | 'max';

export const PERIODS: { value: Period; label: string; years: number | null }[] =
    [
        { value: '1y', label: '1Y', years: 1 },
        { value: '3y', label: '3Y', years: 3 },
        { value: '5y', label: '5Y', years: 5 },
        { value: 'max', label: 'Max', years: null },
    ];

/** The amount the growth chart starts every fund at, ₹. */
export const GROWTH_START = 10_000;

/** A fund's weekly [date, NAV] points, oldest first. */
export type Series = readonly (readonly [string, number])[];

const ID = /^[a-f0-9]{24}$/;

/** Fund ids from the URL: well-formed, without repeats, at most three. Anything else is dropped. */
export function parseFundIds(value: string | null): string[] {
    const ids = (value ?? '').split(',').filter((id) => ID.test(id));
    return [...new Set(ids)].slice(0, COMPARE_MAX_FUNDS);
}

export function parsePeriod(value: string | null): Period {
    return PERIODS.some((p) => p.value === value) ? (value as Period) : '3y';
}

function shiftYears(date: string, years: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** The value of the latest point on or before `date`, or null when every point is later. */
function valueOn(series: Series, date: string): number | null {
    let low = 0;
    let high = series.length - 1;
    let found: number | null = null;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (series[mid]![0] <= date) {
            found = series[mid]![1];
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return found;
}

/** Periods every fund has the history for; Max is always there. */
export function availablePeriods(series: readonly Series[]): Period[] {
    if (series.length === 0) return ['max'];
    const end = series.reduce(
        (max, s) => (s.at(-1)![0] > max ? s.at(-1)![0] : max),
        '',
    );
    const start = series.reduce(
        (max, s) => (s[0]![0] > max ? s[0]![0] : max),
        '',
    );
    return PERIODS.filter(
        (p) => p.years === null || shiftYears(end, p.years) >= start,
    ).map((p) => p.value);
}

export type GrowthPoint = { date: string; values: (number | null)[] };

export type Growth = {
    /** First date of the chart: the period start, or the youngest fund's first NAV for Max. */
    start: string;
    end: string;
    points: GrowthPoint[];
    /** Each fund's value on the last date, ₹. */
    final: (number | null)[];
};

/**
 * Every fund rebased to ₹10,000 on the same start date and sampled on one
 * weekly grid, so the lines can be read against each other.
 */
export function growth(
    series: readonly Series[],
    period: Period,
): Growth | null {
    if (series.length === 0 || series.some((s) => s.length < 2)) return null;

    const end = series.reduce(
        (max, s) => (s.at(-1)![0] > max ? s.at(-1)![0] : max),
        '',
    );
    const common = series.reduce(
        (max, s) => (s[0]![0] > max ? s[0]![0] : max),
        '',
    );
    const years = PERIODS.find((p) => p.value === period)!.years;
    const wanted = years === null ? common : shiftYears(end, years);
    const start = wanted > common ? wanted : common;
    if (start >= end) return null;

    const dates: string[] = [];
    for (let date = end; date > start; date = addDays(date, -7))
        dates.push(date);
    dates.push(start);
    dates.reverse();

    const base = series.map((s) => valueOn(s, start));
    const points = dates.map((date) => ({
        date,
        values: series.map((s, i) => {
            const nav = valueOn(s, date);
            return nav === null || !base[i]
                ? null
                : Math.round((GROWTH_START * nav) / base[i]);
        }),
    }));

    return { start, end, points, final: points.at(-1)!.values };
}

/**
 * Which funds hold the best value in a row: the highest (or lowest) one.
 * None when fewer than two funds have a figure or they're all equal.
 */
export function bestOf(
    values: readonly (number | null)[],
    better: 'high' | 'low' | null,
): Set<number> {
    if (better === null) return new Set();
    const present = values.filter((v): v is number => v !== null);
    if (present.length < 2 || present.every((v) => v === present[0]))
        return new Set();

    const target =
        better === 'high' ? Math.max(...present) : Math.min(...present);
    return new Set(values.flatMap((v, i) => (v === target ? [i] : [])));
}

/** How strongly a calendar-year cell is tinted: 6% for tiny returns up to 28% at ±30% or more. */
export function tint(pct: number): { tone: 'gain' | 'loss'; strength: number } {
    const size = Math.min(Math.abs(pct), 30) / 30;
    return {
        tone: pct < 0 ? 'loss' : 'gain',
        strength: Math.round(6 + size * 22),
    };
}

export type RangeAxis = {
    min: number;
    max: number;
    /** Where a value sits along the axis, 0–100 (%). */
    at: (value: number) => number;
};

/**
 * One axis for every fund's worst-to-best range, always including 0%, with a
 * little room at both ends. Null when no fund has a range.
 */
export function rangeAxis(
    ranges: readonly ({ min: number; max: number } | null)[],
): RangeAxis | null {
    const present = ranges.filter((r) => r !== null);
    if (present.length === 0) return null;

    const low = Math.min(0, ...present.map((r) => r.min));
    const high = Math.max(0, ...present.map((r) => r.max));
    const pad = Math.max((high - low) * 0.04, 0.5);
    const min = low - pad;
    const max = high + pad;

    return { min, max, at: (value) => ((value - min) / (max - min)) * 100 };
}
