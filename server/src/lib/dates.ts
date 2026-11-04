/**
 * Helpers for calendar dates stored as "YYYY-MM-DD" strings. They work on the
 * date alone (via UTC), so the server's timezone never shifts a day.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

function pad(n: number, width = 2): string {
    return String(n).padStart(width, '0');
}

/** "YYYY-MM-DD" for a valid y/m/d, else null (rejects 31 Feb and the like). */
function makeDate(year: number, month: number, day: number): string | null {
    const utc = new Date(Date.UTC(year, month - 1, day));

    if (
        utc.getUTCFullYear() !== year ||
        utc.getUTCMonth() !== month - 1 ||
        utc.getUTCDate() !== day
    ) {
        return null;
    }

    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function toUtc(date: string): Date {
    const match = ISO_DATE.exec(date);

    if (!match || makeDate(+match[1]!, +match[2]!, +match[3]!) === null) {
        throw new RangeError(`Not a YYYY-MM-DD date: [${date}].`);
    }

    return new Date(`${date}T00:00:00Z`);
}

export function isIsoDate(value: string): boolean {
    const match = ISO_DATE.exec(value);
    return (
        match !== null && makeDate(+match[1]!, +match[2]!, +match[3]!) !== null
    );
}

export function addDays(date: string, days: number): string {
    const utc = toUtc(date);
    utc.setUTCDate(utc.getUTCDate() + days);
    return utc.toISOString().slice(0, 10);
}

/** Monday to Friday. */
/**
 * Add (or subtract) whole years, overflowing like Carbon's addYears():
 * 29 Feb 2024 − 1 year = 1 Mar 2023.
 */
export function addYearsOverflow(date: string, years: number): string {
    const utc = toUtc(date);
    return new Date(
        Date.UTC(
            utc.getUTCFullYear() + years,
            utc.getUTCMonth(),
            utc.getUTCDate(),
        ),
    )
        .toISOString()
        .slice(0, 10);
}

export function isWeekday(date: string): boolean {
    const day = toUtc(date).getUTCDay();
    return day !== 0 && day !== 6;
}

/** AMFI's "07-Oct-2026" → "2026-10-07"; null if malformed or not a real date. */
export function parseDayMonthNameYear(value: string): string | null {
    const match = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(value);
    if (!match) return null;

    const month = MONTHS.indexOf(match[2]!) + 1;
    return month === 0 ? null : makeDate(+match[3]!, month, +match[1]!);
}

/** mfapi's "07-10-2026" → "2026-10-07"; null if malformed or not a real date. */
export function parseDayMonthYear(value: string): string | null {
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
    return match ? makeDate(+match[3]!, +match[2]!, +match[1]!) : null;
}

/** "2026-10-07" → "07 Oct 2026". */
export function formatShort(date: string): string {
    const utc = toUtc(date);
    return `${pad(utc.getUTCDate())} ${MONTHS[utc.getUTCMonth()]} ${utc.getUTCFullYear()}`;
}

/** Days since 1970-01-01, so solvers can subtract plain integers. */
export function epochDay(date: string): number {
    return toUtc(date).getTime() / 86_400_000;
}

/** Days in a month (month 1–12). */
export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2026-10-07" → "7 Oct 2026" (PHP's "j M Y", used in messages). */
export function formatHuman(date: string): string {
    const utc = toUtc(date);
    return `${utc.getUTCDate()} ${MONTHS[utc.getUTCMonth()]} ${utc.getUTCFullYear()}`;
}

/** Carbon's addMonthsNoOverflow(): same day, clamped to the target month's end. */
export function addMonthsNoOverflow(date: string, months: number): string {
    toUtc(date);
    const total =
        Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 + months;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    const day = Math.min(Number(date.slice(8, 10)), daysInMonth(year, month));

    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}
