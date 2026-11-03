const inr = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
});

const monthFormat = new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    timeZone: 'UTC',
});

const dayMonthFormat = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
});

const dateFormat = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
});

/**
 * Format integer paise as rupees, e.g. 1000050 → "₹10,000.50".
 */
export function formatPaise(paise: number): string {
    return inr.format(paise / 100);
}

/**
 * Whole rupees with Indian grouping, e.g. 1161695 → "₹11,61,695" (calculators).
 */
export function formatRupees(rupees: number): string {
    return inrWhole.format(Math.round(rupees));
}

/**
 * Format a signed amount of paise with an explicit sign, e.g. "+₹1,234.50" or "−₹50.00".
 */
export function formatSignedPaise(paise: number): string {
    const sign = paise > 0 ? '+' : paise < 0 ? '−' : '';

    return `${sign}${inr.format(Math.abs(paise) / 100)}`;
}

/**
 * Format a percentage with 2 decimals, optionally signed, e.g. "+12.34%".
 */
export function formatPercent(
    pct: number,
    { signed = false }: { signed?: boolean } = {},
): string {
    const sign = signed && pct > 0 ? '+' : pct < 0 ? '−' : '';

    return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

/**
 * Paise as a plain rupee string for form inputs, e.g. 500000 → "5000".
 */
export function paiseToRupeeInput(paise: number): string {
    const rupees = Math.floor(paise / 100);
    const rest = paise % 100;

    return rest === 0
        ? String(rupees)
        : `${rupees}.${String(rest).padStart(2, '0')}`;
}

/**
 * Short rupee amounts for chart axes, e.g. 450000000 paise → "₹45L".
 */
export function formatCompactPaise(paise: number): string {
    return inrCompact.format(paise / 100);
}

/**
 * Axis date labels: "Oct '26" for long ranges, "5 Oct" for short ones.
 */
export function formatAxisDate(date: string, short: boolean): string {
    const parsed = new Date(`${date}T00:00:00Z`);

    return short
        ? dayMonthFormat.format(parsed)
        : `${monthFormat.format(parsed)} '${date.slice(2, 4)}`;
}

/**
 * Format a Y-m-d date, e.g. "2026-10-05" → "5 Oct 2026".
 */
export function formatDate(date: string): string {
    return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

/**
 * Format a NAV string with Indian digit grouping, keeping all 4 decimals.
 */
export function formatNav(nav: string): string {
    return `₹${groupIndian(nav)}`;
}

/**
 * Format a units string with Indian digit grouping, keeping all 3 decimals.
 */
export function formatUnits(units: string): string {
    return groupIndian(units);
}

/**
 * Ordinal day of month, e.g. 1 → "1st", 22 → "22nd".
 */
export function ordinal(day: number): string {
    const suffix =
        day % 100 >= 11 && day % 100 <= 13
            ? 'th'
            : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[
                  day % 10
              ] ?? 'th');

    return `${day}${suffix}`;
}

// Group the integer part as 12,34,567 without converting through floats.
function groupIndian(value: string): string {
    const [whole = '', fraction] = value.split('.');
    const negative = whole.startsWith('-');
    const digits = negative ? whole.slice(1) : whole;
    const lastThree = digits.slice(-3);
    const rest = digits.slice(0, -3);
    const grouped = rest
        ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`
        : lastThree;

    return `${negative ? '-' : ''}${grouped}${fraction !== undefined ? `.${fraction}` : ''}`;
}
