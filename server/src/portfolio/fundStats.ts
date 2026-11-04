/**
 * Trailing returns, volatility and the worst fall of a scheme, from its NAVs
 * (port of App\Portfolio\FundStats and FundStatsResult).
 *
 * NAVs stay decimal strings; only the ratios between them become floats, since
 * roots and square roots of a rate don't need exact decimals (as in Xirr).
 */
import type { FundStatsJson } from '@hisaab/shared';

import { addDays, addYearsOverflow, epochDay } from '../lib/dates.js';
import { Decimal, roundFloat } from '../lib/decimal.js';

const SCALE = 12;

/** Volatility is measured over the last three years of weekly returns. */
const VOLATILITY_YEARS = 3;

/** Fewer weekly returns than half a year say little about volatility. */
const MIN_WEEKLY_RETURNS = 26;

/**
 * A one-step NAV ratio at least this large (or its inverse) is a change of
 * face value, not a market move. Real funds rarely move 15% in a day; face
 * values change by ×10 or more (₹10 → ₹1,000 is ×100). Not in Laravel.
 */
const FACE_VALUE_JUMP = 8;

/** Returns, volatility and drawdown as fractions (0.15 = 15%). */
export type FundStats = {
    asOf: string;
    since: string;
    return1y: number | null;
    cagr3y: number | null;
    cagr5y: number | null;
    sinceStart: number;
    sinceStartAnnualised: boolean;
    volatility: number | null;
    maxDrawdown: number;
    drawdownPeak: string | null;
    drawdownTrough: string | null;
};

/** @param input NAVs keyed by "YYYY-MM-DD" date. Null with fewer than two positive NAVs. */
export function fundStats(
    input: Readonly<Record<string, string>>,
): FundStats | null {
    const prepared = prepareNavs(input);
    if (prepared === null) return null;
    const { navs, dates } = prepared;

    const first = dates[0]!;
    const last = dates[dates.length - 1]!;
    const years = (epochDay(last) - epochDay(first)) / 365;
    const sinceStart = ratio(navs[last]!, navs[first]!);
    const annualised = years >= 1;
    const [maxDrawdown, drawdownPeak, drawdownTrough] = drawdown(navs, dates);

    return {
        asOf: last,
        since: first,
        return1y: trailing(navs, dates, 1),
        cagr3y: trailing(navs, dates, 3),
        cagr5y: trailing(navs, dates, 5),
        sinceStart: annualised ? sinceStart ** (1 / years) - 1 : sinceStart - 1,
        sinceStartAnnualised: annualised,
        volatility: volatility(navs, dates),
        maxDrawdown,
        drawdownPeak,
        drawdownTrough,
    };
}

/**
 * Positive NAVs in date order, adjusted for face-value changes. Null with
 * fewer than two.
 */
export function prepareNavs(
    input: Readonly<Record<string, string>>,
): { navs: Record<string, string>; dates: string[] } | null {
    const navs: Record<string, string> = {};
    for (const date of Object.keys(input).sort()) {
        const nav = numeric(input[date]!);
        if (Decimal.compare(nav, '0') === 1) navs[date] = nav;
    }

    const dates = Object.keys(navs);
    if (dates.length < 2) return null;
    adjustForFaceValueChanges(navs, dates);
    return { navs, dates };
}

const pct = (fraction: number | null) =>
    fraction === null ? null : roundFloat(fraction * 100, 2);

/** Percentages rounded to 2 decimals, for the API and the cache. */
export function fundStatsJson(stats: FundStats): FundStatsJson {
    return {
        asOf: stats.asOf,
        since: stats.since,
        return1yPct: pct(stats.return1y),
        cagr3yPct: pct(stats.cagr3y),
        cagr5yPct: pct(stats.cagr5y),
        sinceStartPct: pct(stats.sinceStart)!,
        sinceStartAnnualised: stats.sinceStartAnnualised,
        volatilityPct: pct(stats.volatility),
        maxDrawdownPct: pct(stats.maxDrawdown)!,
        drawdownPeak: stats.drawdownPeak,
        drawdownTrough: stats.drawdownTrough,
    };
}

/** Compound annual return over the last N years, or null when the history is shorter. */
export function trailing(
    navs: Record<string, string>,
    dates: string[],
    years: number,
): number | null {
    const end = dates[dates.length - 1]!;
    const start = onOrBefore(dates, addYearsOverflow(end, -years));
    if (start === null) return null;
    return ratio(navs[end]!, navs[start]!) ** (1 / years) - 1;
}

/**
 * Weekly returns over the last `years` (or the whole history if shorter),
 * sampled back from the latest NAV. Null when there are too few to mean much.
 */
export function weeklyReturns(
    navs: Record<string, string>,
    dates: string[],
    years = VOLATILITY_YEARS,
): number[] | null {
    const end = dates[dates.length - 1]!;
    const from = addYearsOverflow(end, -years);
    const floor = from > dates[0]! ? from : dates[0]!;
    // Keyed by the NAV date found, so a gap that repeats the same NAV counts once.
    const weekly = new Map<string, string>();

    for (let date = end; date >= floor; date = addDays(date, -7)) {
        const found = onOrBefore(dates, date);
        if (found === null) break;
        weekly.set(found, navs[found]!);
    }

    // Sparse history repeats the same NAV week after week, which would
    // look like calm rather than missing data.
    if (weekly.size <= MIN_WEEKLY_RETURNS) return null;

    const series = [...weekly.values()].reverse();
    const returns: number[] = [];
    for (let i = 1; i < series.length; i++) {
        returns.push(ratio(series[i]!, series[i - 1]!) - 1);
    }
    return returns;
}

/** Annualised standard deviation of weekly returns over the last three years. */
export function volatility(
    navs: Record<string, string>,
    dates: string[],
): number | null {
    const returns = weeklyReturns(navs, dates);
    if (returns === null) return null;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance =
        returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
        (returns.length - 1);

    return Math.sqrt(variance) * Math.sqrt(52);
}

/** The largest fall from a peak to a later low, with both dates. Zero when the NAV never fell. */
function drawdown(
    navs: Record<string, string>,
    dates: string[],
): [number, string | null, string | null] {
    let peakDate: string | null = null;
    let peakNav: string | null = null;
    let worst = '0';
    let worstPeak: string | null = null;
    let worstTrough: string | null = null;

    for (const date of dates) {
        const nav = navs[date]!;

        if (peakNav === null || Decimal.compare(nav, peakNav) === 1) {
            peakNav = nav;
            peakDate = date;
            continue;
        }

        const fall = Decimal.sub('1', Decimal.div(nav, peakNav, SCALE), SCALE);
        if (Decimal.compare(fall, worst) === 1) {
            worst = fall;
            worstPeak = peakDate;
            worstTrough = date;
        }
    }

    return [Number(worst), worstPeak, worstTrough];
}

/** The latest date in the sorted list on or before the given date. */
export function onOrBefore(dates: string[], date: string): string | null {
    let low = 0;
    let high = dates.length - 1;
    let found: string | null = null;

    while (low <= high) {
        const mid = (low + high) >> 1;
        if (dates[mid]! <= date) {
            found = dates[mid]!;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return found;
}

/**
 * mfapi.in serves NAVs as published, so a face-value change (HDFC Liquid
 * Fund went from ~₹28 to ~₹2,857 on 30 Aug 2015) looks like a 100× gain.
 * Scales the NAVs before each such jump onto today's basis, as share prices
 * are adjusted for splits, so returns since launch and the largest fall stay
 * true. The factor is the nearest power of ten when the jump is close to
 * one, keeping that day's real movement.
 */
function adjustForFaceValueChanges(
    navs: Record<string, string>,
    dates: readonly string[],
): void {
    let factor = '1';
    for (let i = dates.length - 1; i > 0; i--) {
        const before = navs[dates[i - 1]!]!;
        if (factor !== '1')
            navs[dates[i - 1]!] = Decimal.mul(before, factor, SCALE);

        const jump = ratio(navs[dates[i]!]!, navs[dates[i - 1]!]!);
        if (jump < FACE_VALUE_JUMP && jump > 1 / FACE_VALUE_JUMP) continue;

        const power = 10 ** Math.round(Math.log10(jump));
        const step =
            Math.abs(jump / power - 1) < 0.2
                ? String(power)
                : Decimal.div(navs[dates[i]!]!, navs[dates[i - 1]!]!, SCALE);
        navs[dates[i - 1]!] = Decimal.mul(navs[dates[i - 1]!]!, step, SCALE);
        factor = Decimal.mul(factor, step, SCALE);
    }
}

export function ratio(numerator: string, denominator: string): number {
    return Number(Decimal.div(numerator, denominator, SCALE));
}

function numeric(value: string): string {
    return Decimal.isNumeric(value) ? value : '0';
}
