import { describe, expect, it } from 'vitest';

import { sipDueDates } from '../../src/portfolio/sipSchedule.js';

// Port of tests/Unit/Portfolio/SipScheduleTest.php
const dueDates = (
    day: number,
    start: string,
    opts: { end?: string; after?: string; until?: string } = {},
) => sipDueDates({ day, start, until: opts.until ?? '2026-12-31', ...opts });

describe('sipDueDates', () => {
    it('gives monthly dates from the start date', () => {
        expect(dueDates(5, '2026-01-01', { until: '2026-03-20' })).toEqual([
            '2026-01-05',
            '2026-02-05',
            '2026-03-05',
        ]);
    });

    it("skips the first installment when the start date is after that month's day", () => {
        expect(dueDates(5, '2026-01-10', { until: '2026-03-05' })).toEqual([
            '2026-02-05',
            '2026-03-05',
        ]);
    });

    it('can have an installment on the start date itself', () => {
        expect(dueDates(10, '2026-01-10', { until: '2026-01-31' })).toEqual([
            '2026-01-10',
        ]);
    });

    it('puts day 31 on the last day of shorter months', () => {
        expect(dueDates(31, '2026-01-01', { until: '2026-04-30' })).toEqual([
            '2026-01-31',
            '2026-02-28',
            '2026-03-31',
            '2026-04-30',
        ]);
    });

    it('handles days 30 and 29 in a leap-year February', () => {
        expect(dueDates(30, '2028-01-01', { until: '2028-03-31' })).toEqual([
            '2028-01-30',
            '2028-02-29',
            '2028-03-30',
        ]);
        expect(dueDates(29, '2028-02-01', { until: '2028-02-29' })).toEqual([
            '2028-02-29',
        ]);
    });

    it('stops at the end date', () => {
        expect(
            dueDates(5, '2026-01-01', {
                end: '2026-03-04',
                until: '2026-06-30',
            }),
        ).toEqual(['2026-01-05', '2026-02-05']);
    });

    it('can have an installment on the end date itself', () => {
        expect(
            dueDates(5, '2026-01-01', {
                end: '2026-02-05',
                until: '2026-06-30',
            }),
        ).toEqual(['2026-01-05', '2026-02-05']);
    });

    it('returns only dates after the last generated one', () => {
        expect(
            dueDates(5, '2026-01-01', {
                after: '2026-02-05',
                until: '2026-04-30',
            }),
        ).toEqual(['2026-03-05', '2026-04-05']);
    });

    it('has nothing due when after equals until', () => {
        expect(
            dueDates(5, '2026-01-01', {
                after: '2026-03-05',
                until: '2026-03-05',
            }),
        ).toEqual([]);
    });

    it('has nothing due before the start date', () => {
        expect(dueDates(5, '2026-05-01', { until: '2026-04-30' })).toEqual([]);
    });

    it('applies a changed day only after the last generated date', () => {
        // Generated on the 5th until March; the user then moved the SIP to the 20th.
        expect(
            dueDates(20, '2026-01-01', {
                after: '2026-03-05',
                until: '2026-04-30',
            }),
        ).toEqual(['2026-03-20', '2026-04-20']);
    });

    it('spans years for a long-running SIP', () => {
        expect(dueDates(1, '2021-01-01', { until: '2025-12-31' })).toHaveLength(
            60,
        );
    });

    it('rejects a day outside 1–31', () => {
        expect(() => dueDates(0, '2026-01-01')).toThrow(RangeError);
        expect(() => dueDates(32, '2026-01-01')).toThrow(RangeError);
    });
});
