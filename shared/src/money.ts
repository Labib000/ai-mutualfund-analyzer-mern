/**
 * Converts between rupee strings entered by users and integer paise, and
 * formats paise for display (port of App\Support\Money). Integer arithmetic only.
 */

const PLAIN_AMOUNT = /^\d+(\.\d{1,2})?$/;

const normalize = (rupees: string) => rupees.trim().replace(/[, ]/g, '');

/** Whether rupeesToPaise() accepts the string. */
export function isRupeeAmount(rupees: string): boolean {
    return PLAIN_AMOUNT.test(normalize(rupees));
}

/**
 * "10000", "499.5" or "1,00,000.25" → paise.
 * @throws RangeError when not a non-negative amount with at most 2 decimals, or too large
 */
export function rupeesToPaise(rupees: string): number {
    const value = normalize(rupees);

    if (!PLAIN_AMOUNT.test(value)) {
        throw new RangeError(`Not a rupee amount: [${rupees}].`);
    }

    const [whole, fraction = ''] = value.split('.');
    const paise = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));

    if (paise > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError(`Rupee amount too large: [${rupees}].`);
    }

    return Number(paise);
}

/**
 * Paise as rupees with Indian digit grouping: 1234567 → "₹12,345.67",
 * -500 → "−₹5.00", and with `signed`, 500 → "+₹5.00".
 */
export function formatInr(paise: number, signed = false): string {
    if (!Number.isSafeInteger(paise)) {
        throw new RangeError(`Paise must be a safe integer, got ${paise}.`);
    }

    const sign = paise < 0 ? '−' : signed && paise > 0 ? '+' : '';
    const absolute = Math.abs(paise);
    const rupees = String(Math.floor(absolute / 100));
    const fraction = String(absolute % 100).padStart(2, '0');

    const lastThree = rupees.slice(-3);
    const rest = rupees.slice(0, -3);
    const grouped =
        rest === ''
            ? lastThree
            : `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`;

    return `${sign}₹${grouped}.${fraction}`;
}
