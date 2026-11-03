/**
 * "Today" for Hisaab is always the IST calendar date (Asia/Kolkata),
 * as a "YYYY-MM-DD" string. Tests can freeze the clock with setTestNow().
 */

export const APP_TIMEZONE = 'Asia/Kolkata';

const istDateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

let frozenNow: Date | null = null;

/** Freeze the clock (Date or ISO string), or pass null to unfreeze. */
export function setTestNow(at: Date | string | null): void {
    if (at === null) {
        frozenNow = null;
        return;
    }

    const date = typeof at === 'string' ? new Date(at) : new Date(at.getTime());

    if (Number.isNaN(date.getTime())) {
        throw new RangeError(`setTestNow: invalid date ${String(at)}`);
    }

    frozenNow = date;
}

/** The current instant (frozen in tests). Use for timestamps. */
export function now(): Date {
    return frozenNow ? new Date(frozenNow.getTime()) : new Date();
}

/** IST calendar date of an instant, "YYYY-MM-DD". */
export function toIstDate(instant: Date): string {
    // en-CA formats as YYYY-MM-DD.
    return istDateFormat.format(instant);
}

/** Today's IST calendar date, "YYYY-MM-DD". */
export function today(): string {
    return toIstDate(now());
}
