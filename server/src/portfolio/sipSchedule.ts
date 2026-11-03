/** Works out the dates a SIP installment falls due (port of App\Portfolio\SipSchedule). */
import { daysInMonth } from '../lib/dates.js';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Installment dates after `after` (exclusive) up to `until` (inclusive), within
 * the SIP's start and end dates. Days 29–31 fall on the last day of shorter months.
 * All dates are "YYYY-MM-DD"; `day` is the day of month, 1–31.
 */
export function sipDueDates(options: {
    day: number;
    start: string;
    end?: string | null;
    after?: string | null;
    until: string;
}): string[] {
    const { day, start, until } = options;
    const end = options.end ?? null;
    const after = options.after ?? null;

    if (!Number.isInteger(day) || day < 1 || day > 31) {
        throw new RangeError('SIP day must be between 1 and 31.');
    }

    const last = end === null || until < end ? until : end;
    const from = after === null || start > after ? start : after;

    let year = Number(from.slice(0, 4));
    let month = Number(from.slice(5, 7));
    const dates: string[] = [];

    // Compare month starts, as Laravel walks startOfMonth() up to $last.
    while (`${year}-${pad(month)}-01` <= last) {
        const date = `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;

        if (date >= start && date <= last && (after === null || date > after)) {
            dates.push(date);
        }

        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }

    return dates;
}
