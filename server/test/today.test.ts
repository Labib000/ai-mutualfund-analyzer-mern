import { afterEach, describe, expect, it } from 'vitest';

import { now, setTestNow, toIstDate, today } from '../src/lib/today.js';

describe('today()', () => {
    afterEach(() => setTestNow(null));

    it('returns the frozen IST date', () => {
        // The Laravel fixture's "today": Thu 8 Oct 2026.
        setTestNow('2026-10-08T10:00:00+05:30');

        expect(today()).toBe('2026-10-08');
    });

    it('rolls over at IST midnight, not UTC midnight', () => {
        // 18:29 UTC = 23:59 IST, same day.
        setTestNow('2026-10-08T18:29:59Z');
        expect(today()).toBe('2026-10-08');

        // 18:30 UTC = 00:00 IST the next day, while UTC is still the 8th.
        setTestNow('2026-10-08T18:30:00Z');
        expect(today()).toBe('2026-10-09');
    });

    it('is IST early in the UTC day too', () => {
        // 00:30 IST on the 1st is still the previous month in UTC.
        setTestNow('2026-10-31T19:00:00Z');
        expect(today()).toBe('2026-11-01');
    });

    it('now() returns a copy, so callers cannot move the frozen clock', () => {
        setTestNow('2026-10-08T00:00:00Z');
        now().setFullYear(2000);

        expect(now().toISOString()).toBe('2026-10-08T00:00:00.000Z');
    });

    it('rejects invalid dates', () => {
        expect(() => setTestNow('not a date')).toThrow(RangeError);
    });

    it('formats any instant as an IST date', () => {
        expect(toIstDate(new Date('2026-03-31T20:00:00Z'))).toBe('2026-04-01');
    });

    it('uses the real clock when not frozen', () => {
        expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
