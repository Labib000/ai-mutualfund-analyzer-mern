/** Types for the fund compare tool (not in Laravel). */
import type { SchemeSummary } from './portfolio.js';

/** Funds that can be compared at once. */
export const COMPARE_MAX_FUNDS = 3;

/** The monthly installment of the compare page's SIP check, ₹. */
export const COMPARE_SIP_RUPEES = 10_000;

/** Returns over every rolling window of a length, as percentages. */
export type RollingJson = {
    /** How many windows (one per week) were measured. */
    windows: number;
    avgPct: number;
    medianPct: number;
    minPct: number;
    maxPct: number;
    /** Share of windows with a positive return. */
    positivePct: number;
    /** Share of windows returning more than 10% a year. */
    above10Pct: number;
};

export type CalendarYearJson = {
    year: number;
    returnPct: number | null;
    /** The current year so far. */
    partial: boolean;
};

export type SipCheckJson = {
    years: 1 | 3 | 5;
    /** Null when the fund is younger than the period. */
    investedRupees: number | null;
    valueRupees: number | null;
    xirrPct: number | null;
};

export type CompareStatsJson = {
    /** First NAV date, "YYYY-MM-DD". */
    since: string;
    /** Latest NAV date. */
    asOf: string;
    latestNav: string;
    trailing: {
        m1Pct: number | null;
        m3Pct: number | null;
        m6Pct: number | null;
        y1Pct: number | null;
        /** 3, 5 and 10 years are yearly (compound) rates. */
        y3Pct: number | null;
        y5Pct: number | null;
        y10Pct: number | null;
        sinceStartPct: number;
        sinceStartAnnualised: boolean;
    };
    /** Oldest first; the last entry is the current year so far. */
    calendarYears: CalendarYearJson[];
    rolling: { y1: RollingJson | null; y3: RollingJson | null };
    risk: {
        /** Years of history the volatility, Sharpe and Sortino use (at most 3). */
        basisYears: number;
        volatilityPct: number | null;
        sharpe: number | null;
        sortino: number | null;
        /** Over the whole history, as a positive percentage. */
        maxDrawdownPct: number;
        drawdownPeak: string | null;
        drawdownTrough: string | null;
        /** When the NAV first got back above the peak; null if it hasn't. */
        recoveredOn: string | null;
    };
    sip: SipCheckJson[];
    /** Weekly [date, NAV] points, oldest first, adjusted for face-value changes. */
    series: [string, number][];
};

export type CompareFundJson = {
    scheme: SchemeSummary;
    /** The user's holding of this fund, if they hold it. */
    holdingId: string | null;
    /** Null when the scheme has fewer than two NAVs. */
    stats: CompareStatsJson | null;
};

export type CompareResponse = {
    funds: CompareFundJson[];
    /** The risk-free rate Sharpe and Sortino use, % a year. */
    riskFreeRatePct: number;
};
