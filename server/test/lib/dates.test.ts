import { describe, expect, it } from 'vitest';

import {
    addDays,
    formatShort,
    isIsoDate,
    isWeekday,
    parseDayMonthNameYear,
    parseDayMonthYear,
} from '../../src/lib/dates.js';

describe('date helpers', () => {
    it('adds days across month and year ends', () => {
        expect(addDays('2026-10-01', 7)).toBe('2026-10-08');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(addDays('2026-10-08', -30)).toBe('2026-09-08');
    });

    it('knows weekdays', () => {
        expect(isWeekday('2026-10-02')).toBe(true); // Fri
        expect(isWeekday('2026-10-03')).toBe(false); // Sat
        expect(isWeekday('2026-10-04')).toBe(false); // Sun
        expect(isWeekday('2026-10-05')).toBe(true); // Mon
    });

    it('parses AMFI dates', () => {
        expect(parseDayMonthNameYear('07-Oct-2026')).toBe('2026-10-07');
        expect(parseDayMonthNameYear('31-Feb-2026')).toBeNull();
        expect(parseDayMonthNameYear('7-Oct-2026')).toBeNull();
        expect(parseDayMonthNameYear('07-oct-2026')).toBeNull();
        expect(parseDayMonthNameYear('N.A.')).toBeNull();
    });

    it('parses mfapi dates', () => {
        expect(parseDayMonthYear('07-10-2026')).toBe('2026-10-07');
        expect(parseDayMonthYear('2026-10-07')).toBeNull();
        expect(parseDayMonthYear('30-02-2026')).toBeNull();
    });

    it('validates and formats ISO dates', () => {
        expect(isIsoDate('2026-10-07')).toBe(true);
        expect(isIsoDate('2026-02-30')).toBe(false);
        expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
        expect(formatShort('2026-10-07')).toBe('07 Oct 2026');
    });
});
