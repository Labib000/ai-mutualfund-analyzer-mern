/**
 * Annualised internal rate of return for irregular cash flows, using Excel's
 * XIRR() convention: the rate r where Σ amount / (1 + r)^((date − first date) / 365) = 0
 * (port of App\Portfolio\Xirr).
 *
 * The result is a rate, not money, so the solver works in floats.
 */
import { epochDay } from '../lib/dates.js';

/**
 * Money moving between the investor and a fund on a date. Negative amounts are
 * money invested, positive amounts are money received (or current value).
 */
export type CashFlow = {
    /** "YYYY-MM-DD". */
    date: string;
    amountPaise: number;
};

const DAYS_PER_YEAR = 365;
const MAX_NEWTON_ITERATIONS = 100;
const MAX_BISECTION_ITERATIONS = 300;
const TOLERANCE = 1e-10;
const LOWEST_RATE = -0.999999999;
const HIGHEST_RATE = 1e6;

/** [amount in rupees, years since the first flow] */
type Point = [number, number];

/** The rate as a fraction (0.15 = 15%), or null when the flows have no meaningful rate. */
export function xirr(flows: readonly CashFlow[]): number | null {
    const nonZero = flows.filter((flow) => flow.amountPaise !== 0);

    if (
        !nonZero.some((f) => f.amountPaise < 0) ||
        !nonZero.some((f) => f.amountPaise > 0)
    ) {
        return null;
    }

    const days = nonZero.map((flow) => epochDay(flow.date));
    const start = Math.min(...days);
    const points: Point[] = nonZero.map((flow, i) => [
        flow.amountPaise / 100,
        (days[i]! - start) / DAYS_PER_YEAR,
    ]);

    return newton(points) ?? bisection(points);
}

function newton(points: Point[]): number | null {
    let rate = 0.1;

    for (let i = 0; i < MAX_NEWTON_ITERATIONS; i += 1) {
        let value = 0;
        let derivative = 0;

        for (const [amount, years] of points) {
            const discount = (1 + rate) ** -years;
            value += amount * discount;
            derivative -= (years * amount * discount) / (1 + rate);
        }

        if (
            derivative === 0 ||
            !Number.isFinite(value) ||
            !Number.isFinite(derivative)
        ) {
            return null;
        }

        const next = rate - value / derivative;

        if (!Number.isFinite(next) || next <= -1) return null;
        if (Math.abs(next - rate) < TOLERANCE) return next;

        rate = next;
    }

    return null;
}

/** Fallback when Newton's method doesn't converge: bracket a sign change, then halve it. */
function bisection(points: Point[]): number | null {
    let low = LOWEST_RATE;
    let high = 1;
    let lowValue = presentValue(points, low);
    let highValue = presentValue(points, high);

    while (sameSign(lowValue, highValue)) {
        if (high >= HIGHEST_RATE) return null;
        low = high;
        lowValue = highValue;
        high *= 2;
        highValue = presentValue(points, high);
    }

    for (
        let i = 0;
        i < MAX_BISECTION_ITERATIONS && high - low > TOLERANCE;
        i += 1
    ) {
        const mid = (low + high) / 2;
        const midValue = presentValue(points, mid);

        if (sameSign(lowValue, midValue)) {
            low = mid;
            lowValue = midValue;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
}

function presentValue(points: Point[], rate: number): number {
    let value = 0;
    for (const [amount, years] of points)
        value += amount * (1 + rate) ** -years;
    return value;
}

const sameSign = (a: number, b: number) => (a > 0 && b > 0) || (a < 0 && b < 0);
