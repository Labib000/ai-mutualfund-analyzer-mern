/** Number formatting shared by the AI text builders, matching PHP's output. */
import { formatHuman } from '../lib/dates.js';
import { roundFloat } from '../lib/decimal.js';

const grouped = (decimals: number) =>
    new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

/** PHP's number_format($n, $d): rounded half away from zero, with commas. */
export function numberFormat(value: number, decimals: number): string {
    return grouped(decimals).format(roundFloat(value, decimals));
}

/** "+1.05%", "−0.26%" or "0.00%" (rounded first, so −0.001 shows no sign). */
export function signedPercent(pct: number, decimals = 2): string {
    const rounded = roundFloat(pct, decimals);
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return `${sign}${numberFormat(Math.abs(rounded), decimals)}%`;
}

/** "2026-10-07" → "7 Oct 2026" (Carbon's "j M Y"). */
export const aiDate = (date: string) => formatHuman(date);
