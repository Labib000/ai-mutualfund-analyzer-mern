/**
 * One fund's figures for the compare tool: trailing, calendar-year and
 * rolling returns, risk ratios, a SIP check and a weekly NAV series. Not in
 * Laravel. Each fund is worked out on its own, so results cache per scheme.
 *
 * Ratios between NAVs are floats, as in fundStats; 1Y/3Y/5Y and volatility
 * come from fundStats' own helpers so both pages always agree.
 */
import {
    COMPARE_SIP_RUPEES,
    type CalendarYearJson,
    type CompareStatsJson,
    type RollingJson,
    type SipCheckJson,
} from '@hisaab/shared';

import {
    addDays,
    addMonthsNoOverflow,
    addYearsOverflow,
    epochDay,
} from '../lib/dates.js';
import { Decimal, roundFloat } from '../lib/decimal.js';
import {
    onOrBefore,
    prepareNavs,
    ratio,
    trailing,
    volatility,
    weeklyReturns,
} from './fundStats.js';
import { sipDueDates } from './sipSchedule.js';
import { xirr } from './xirr.js';

/** Volatility, Sharpe and Sortino look at the last three years. */
const RISK_YEARS = 3;
/** Fewer rolling windows than half a year of weeks say little. */
const MIN_WINDOWS = 26;
/** Rolling windows end within this many years of the latest NAV. */
const ROLLING_LOOKBACK = { 1: 5, 3: 10 } as const;
const CALENDAR_YEARS = 5;
const SIP_YEARS = [1, 3, 5] as const;

type Navs = Record<string, string>;

const pct = (fraction: number | null) =>
    fraction === null ? null : roundFloat(fraction * 100, 2);

/**
 * @param input NAVs keyed by "YYYY-MM-DD" date
 * @param riskFreeRate yearly, as a fraction (0.065 = 6.5%)
 * @returns null with fewer than two positive NAVs
 */
export function compareStats(
    input: Readonly<Record<string, string>>,
    riskFreeRate: number,
): CompareStatsJson | null {
    const prepared = prepareNavs(input);
    if (prepared === null) return null;
    const { navs, dates } = prepared;

    const first = dates[0]!;
    const last = dates[dates.length - 1]!;
    const years = (epochDay(last) - epochDay(first)) / 365;
    const growth = ratio(navs[last]!, navs[first]!);
    const annualised = years >= 1;

    return {
        since: first,
        asOf: last,
        // The latest NAV as published (adjustments only scale older ones).
        latestNav: navs[last]!,
        trailing: {
            m1Pct: pct(monthsBack(navs, dates, 1)),
            m3Pct: pct(monthsBack(navs, dates, 3)),
            m6Pct: pct(monthsBack(navs, dates, 6)),
            y1Pct: pct(trailing(navs, dates, 1)),
            y3Pct: pct(trailing(navs, dates, 3)),
            y5Pct: pct(trailing(navs, dates, 5)),
            y10Pct: pct(trailing(navs, dates, 10)),
            sinceStartPct: pct(
                annualised ? growth ** (1 / years) - 1 : growth - 1,
            )!,
            sinceStartAnnualised: annualised,
        },
        calendarYears: calendarYears(navs, dates),
        rolling: {
            y1: rolling(navs, dates, 1),
            y3: rolling(navs, dates, 3),
        },
        risk: risk(navs, dates, riskFreeRate),
        sip: SIP_YEARS.map((y) => sipCheck(navs, dates, y)),
        series: weeklySeries(navs, dates),
    };
}

/** Plain (not yearly) return over the last N months, or null when the history is shorter. */
function monthsBack(navs: Navs, dates: string[], months: number) {
    const end = dates[dates.length - 1]!;
    const start = onOrBefore(dates, addMonthsNoOverflow(end, -months));
    return start === null ? null : ratio(navs[end]!, navs[start]!) - 1;
}

/** Each of the last five full years (31 Dec to 31 Dec) and the current year so far. */
function calendarYears(navs: Navs, dates: string[]): CalendarYearJson[] {
    const end = dates[dates.length - 1]!;
    const current = Number(end.slice(0, 4));
    const yearEnd = (year: number) => onOrBefore(dates, `${year}-12-31`);
    const result: CalendarYearJson[] = [];

    for (let year = current - CALENDAR_YEARS; year <= current; year++) {
        const from = yearEnd(year - 1);
        const to = year === current ? end : yearEnd(year);
        result.push({
            year,
            // A fund launched during the year has no full-year figure.
            returnPct:
                from === null || to === null || to <= from
                    ? null
                    : pct(ratio(navs[to]!, navs[from]!) - 1),
            partial: year === current,
        });
    }

    return result;
}

/**
 * The yearly return of every `years`-long window ending on a weekly sample
 * within the lookback. Null with fewer than MIN_WINDOWS windows.
 */
function rolling(
    navs: Navs,
    dates: string[],
    years: 1 | 3,
): RollingJson | null {
    const first = dates[0]!;
    const end = dates[dates.length - 1]!;
    const floor = addYearsOverflow(end, -ROLLING_LOOKBACK[years]);
    const seen = new Set<string>();
    const returns: number[] = [];

    for (let date = end; date >= floor; date = addDays(date, -7)) {
        const to = onOrBefore(dates, date);
        if (to === null || seen.has(to)) continue;
        seen.add(to);

        const target = addYearsOverflow(to, -years);
        if (target < first) break;
        const from = onOrBefore(dates, target)!;
        returns.push(ratio(navs[to]!, navs[from]!) ** (1 / years) - 1);
    }

    if (returns.length < MIN_WINDOWS) return null;

    const sorted = [...returns].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    const median =
        sorted.length % 2 === 1
            ? sorted[middle]!
            : (sorted[middle - 1]! + sorted[middle]!) / 2;
    const share = (count: number) =>
        roundFloat((count / returns.length) * 100, 1);

    return {
        windows: returns.length,
        avgPct: pct(returns.reduce((s, r) => s + r, 0) / returns.length)!,
        medianPct: pct(median)!,
        minPct: pct(sorted[0]!)!,
        maxPct: pct(sorted[sorted.length - 1]!)!,
        positivePct: share(returns.filter((r) => r > 0).length),
        above10Pct: share(returns.filter((r) => r > 0.1).length),
    };
}

function risk(
    navs: Navs,
    dates: string[],
    riskFreeRate: number,
): CompareStatsJson['risk'] {
    const first = dates[0]!;
    const end = dates[dates.length - 1]!;
    const from = addYearsOverflow(end, -RISK_YEARS);
    const start = from > first ? onOrBefore(dates, from)! : first;
    const basisYears = (epochDay(end) - epochDay(start)) / 365;

    const vol = volatility(navs, dates);
    const returns = weeklyReturns(navs, dates, RISK_YEARS);
    let sharpe: number | null = null;
    let sortino: number | null = null;

    // A ratio of a yearly return needs at least a year of it.
    if (returns !== null && basisYears >= 1) {
        const cagr = ratio(navs[end]!, navs[start]!) ** (1 / basisYears) - 1;
        const excess = cagr - riskFreeRate;
        if (vol !== null && vol > 0) sharpe = excess / vol;

        // Only weeks that did worse than the risk-free rate count as risk.
        const weeklyFree = (1 + riskFreeRate) ** (1 / 52) - 1;
        const downside =
            returns.reduce(
                (sum, r) => sum + Math.min(r - weeklyFree, 0) ** 2,
                0,
            ) / returns.length;
        if (downside > 0)
            sortino = excess / (Math.sqrt(downside) * Math.sqrt(52));
    }

    return {
        basisYears: roundFloat(basisYears, 1),
        volatilityPct: pct(vol),
        sharpe: sharpe === null ? null : roundFloat(sharpe, 2),
        sortino: sortino === null ? null : roundFloat(sortino, 2),
        ...drawdown(navs, dates),
    };
}

/** The largest fall from a peak over the whole history, and when it was made back. */
function drawdown(navs: Navs, dates: string[]) {
    let peak = dates[0]!;
    let worst = 0;
    let worstPeak: string | null = null;
    let worstTrough: string | null = null;

    for (const date of dates) {
        if (Decimal.compare(navs[date]!, navs[peak]!) === 1) {
            peak = date;
            continue;
        }
        const fall = 1 - ratio(navs[date]!, navs[peak]!);
        if (fall > worst) {
            worst = fall;
            worstPeak = peak;
            worstTrough = date;
        }
    }

    let recoveredOn: string | null = null;
    if (worstPeak !== null && worstTrough !== null) {
        recoveredOn =
            dates.find(
                (date) =>
                    date > worstTrough! &&
                    Decimal.compare(navs[date]!, navs[worstPeak!]!) >= 0,
            ) ?? null;
    }

    return {
        maxDrawdownPct: pct(worst)!,
        drawdownPeak: worstPeak,
        drawdownTrough: worstTrough,
        recoveredOn,
    };
}

/**
 * ₹10,000 on the 1st of every month (the next NAV when the 1st isn't a
 * business day) for the last N years, valued at the latest NAV.
 */
function sipCheck(navs: Navs, dates: string[], years: 1 | 3 | 5): SipCheckJson {
    const empty = {
        years,
        investedRupees: null,
        valueRupees: null,
        xirrPct: null,
    };
    const end = dates[dates.length - 1]!;
    const start = addDays(addYearsOverflow(end, -years), 1);
    if (start < dates[0]!) return empty;

    let units = 0;
    const flows = [];
    for (const due of sipDueDates({ day: 1, start, until: end })) {
        const date = onOrAfter(dates, due);
        if (date === null) continue;
        units += COMPARE_SIP_RUPEES / Number(navs[date]);
        flows.push({ date, amountPaise: -COMPARE_SIP_RUPEES * 100 });
    }
    if (flows.length === 0) return empty;

    const value = units * Number(navs[end]);
    flows.push({ date: end, amountPaise: Math.round(value * 100) });

    return {
        years,
        investedRupees: (flows.length - 1) * COMPARE_SIP_RUPEES,
        valueRupees: Math.round(value),
        xirrPct: pct(xirr(flows)),
    };
}

/** The first date in the sorted list on or after the given date. */
function onOrAfter(dates: string[], date: string): string | null {
    let low = 0;
    let high = dates.length - 1;
    let found: string | null = null;

    while (low <= high) {
        const mid = (low + high) >> 1;
        if (dates[mid]! >= date) {
            found = dates[mid]!;
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }

    return found;
}

/** One NAV a week back from the latest, oldest first, for the growth chart. */
function weeklySeries(navs: Navs, dates: string[]): [string, number][] {
    const first = dates[0]!;
    const points: [string, number][] = [];
    const seen = new Set<string>();

    for (let date = dates[dates.length - 1]!; ; date = addDays(date, -7)) {
        const found = date < first ? first : onOrBefore(dates, date)!;
        if (!seen.has(found)) {
            seen.add(found);
            points.push([found, Number(Number(navs[found]).toPrecision(8))]);
        }
        if (date <= first) break;
    }

    return points.reverse();
}
