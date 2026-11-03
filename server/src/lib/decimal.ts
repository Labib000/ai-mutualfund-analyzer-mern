/**
 * Exact decimal arithmetic on numeric strings (port of App\Support\Decimal).
 * NAVs and units never pass through JS numbers.
 */
import { Decimal as DecimalJs } from 'decimal.js';

/** decimal.js configured to round half away from zero, like bcmath round(). */
export const Dec = DecimalJs.clone({
    precision: 40,
    rounding: DecimalJs.ROUND_HALF_UP,
});
export type Dec = InstanceType<typeof Dec>;

/**
 * For bcmath-style arithmetic: enough precision to be exact for our sizes,
 * and results truncated towards zero to the requested scale, like bcadd() & co.
 */
const Bc = DecimalJs.clone({ precision: 80, rounding: DecimalJs.ROUND_DOWN });

const truncate = (value: InstanceType<typeof Bc>, scale: number) =>
    normalizeZero(value.toFixed(scale, Bc.ROUND_DOWN));

/** "-0.000" → "0.000" */
const normalizeZero = (value: string) =>
    value.startsWith('-') && new Dec(value).isZero() ? value.slice(1) : value;

const NUMERIC = /^-?\d+(\.\d+)?$/;

export const Decimal = {
    /** A plain decimal such as "12", "-0.5" or "29.23040" (no exponents, no leading dot). */
    isNumeric(value: string): boolean {
        return NUMERIC.test(value);
    },

    /** Round half away from zero to `scale` places, padded: round("49.56", 4) = "49.5600". */
    round(value: string, scale: number): string {
        const trimmed = value.trim();

        if (!NUMERIC.test(trimmed)) {
            throw new RangeError(`Not a decimal number: [${value}].`);
        }

        if (!Number.isInteger(scale) || scale < 0) {
            throw new RangeError('Scale must be zero or greater.');
        }

        return normalizeZero(
            new Dec(trimmed).toFixed(scale, Dec.ROUND_HALF_UP),
        );
    },

    /** bcadd: a + b truncated to `scale` places. */
    add(a: string, b: string, scale: number): string {
        return truncate(new Bc(a).plus(b), scale);
    },

    /** bcsub: a − b truncated to `scale` places. */
    sub(a: string, b: string, scale: number): string {
        return truncate(new Bc(a).minus(b), scale);
    },

    /** bcmul: a × b truncated to `scale` places. */
    mul(a: string, b: string, scale: number): string {
        return truncate(new Bc(a).times(b), scale);
    },

    /** bcdiv: a ÷ b truncated to `scale` places. */
    div(a: string, b: string, scale: number): string {
        if (new Bc(b).isZero()) throw new RangeError('Division by zero.');
        return truncate(new Bc(a).div(b), scale);
    },

    /** -1, 0 or 1. */
    compare(a: string, b: string): -1 | 0 | 1 {
        return new Dec(a).comparedTo(b) as -1 | 0 | 1;
    },
};

/**
 * PHP's round($float, $places) for derived rates and percentages: half away from
 * zero, after reducing the float to 15 significant digits as PHP does.
 */
export function roundFloat(value: number, places: number): number {
    if (!Number.isFinite(value)) return value;
    return new Dec(value.toPrecision(15))
        .toDecimalPlaces(places, Dec.ROUND_HALF_UP)
        .toNumber();
}
