import { describe, expect, it } from 'vitest';

import {
    availablePeriods,
    bestOf,
    rangeAxis,
    tint,
    growth,
    parseFundIds,
    parsePeriod,
} from './compare';

const a = 'a'.repeat(24);
const b = 'b'.repeat(24);
const c = 'c'.repeat(24);
const d = 'd'.repeat(24);

/** Weekly points from `from` for `weeks` weeks, growing by `rate` a week. */
function weekly(
    from: string,
    weeks: number,
    rate = 0,
    start = 10,
): [string, number][] {
    const points: [string, number][] = [];
    const date = new Date(`${from}T00:00:00Z`);
    for (let i = 0; i < weeks; i++) {
        points.push([date.toISOString().slice(0, 10), start * (1 + rate) ** i]);
        date.setUTCDate(date.getUTCDate() + 7);
    }
    return points;
}

describe('parseFundIds', () => {
    it('keeps up to three well-formed ids, once each', () => {
        expect(parseFundIds(`${a},nope,${b},${a},${c},${d}`)).toEqual([
            a,
            b,
            c,
        ]);
        expect(parseFundIds(null)).toEqual([]);
    });
});

describe('parsePeriod', () => {
    it('falls back to 3 years', () => {
        expect(parsePeriod('5y')).toBe('5y');
        expect(parsePeriod('7y')).toBe('3y');
    });
});

describe('availablePeriods', () => {
    it('offers only periods the youngest fund covers', () => {
        // Both end on 22 Jun 2026.
        const old = weekly('2015-01-05', 600);
        const young = weekly('2024-01-01', 130);

        expect(availablePeriods([old])).toEqual(['1y', '3y', '5y', 'max']);
        expect(availablePeriods([old, young])).toEqual(['1y', 'max']);
    });
});

describe('growth', () => {
    it('starts every fund at ₹10,000 on the same date', () => {
        const flat = weekly('2020-01-06', 300);
        const rising = weekly('2020-01-06', 300, 0.01);

        const g = growth([flat, rising], '1y')!;

        expect(g.points[0]!.values).toEqual([10_000, 10_000]);
        expect(g.final[0]).toBe(10_000);
        // A year back falls between weekly points: it starts from the one before, 53 weeks back.
        expect(g.final[1]).toBe(Math.round(10_000 * 1.01 ** 53));
        expect(g.end).toBe(flat.at(-1)![0]);
    });

    it('starts Max at the youngest fund’s first NAV', () => {
        const old = weekly('2015-01-05', 600);
        const young = weekly('2024-01-01', 130, 0.002);

        const g = growth([old, young], 'max')!;

        expect(g.start).toBe('2024-01-01');
        expect(g.points[0]!.values).toEqual([10_000, 10_000]);
    });

    it('is null without enough history', () => {
        expect(growth([], 'max')).toBeNull();
        expect(growth([weekly('2026-01-05', 1)], 'max')).toBeNull();
    });
});

describe('bestOf', () => {
    it('marks the highest or lowest', () => {
        expect([...bestOf([5, 9, null], 'high')]).toEqual([1]);
        expect([...bestOf([5, 9, 3], 'low')]).toEqual([2]);
        expect([...bestOf([9, 9, 3], 'high')]).toEqual([0, 1]);
    });

    it('marks nothing with one figure, all equal, or no direction', () => {
        expect(bestOf([5, null], 'high').size).toBe(0);
        expect(bestOf([5, 5], 'high').size).toBe(0);
        expect(bestOf([5, 9], null).size).toBe(0);
    });
});

describe('tint', () => {
    it('grows with the size of the return, up to ±30%', () => {
        expect(tint(0)).toEqual({ tone: 'gain', strength: 6 });
        expect(tint(15)).toEqual({ tone: 'gain', strength: 17 });
        expect(tint(-45)).toEqual({ tone: 'loss', strength: 28 });
    });
});

describe('rangeAxis', () => {
    it('puts every range on one axis that includes 0%', () => {
        const axis = rangeAxis([
            { min: 5, max: 25 },
            null,
            { min: 10, max: 15 },
        ])!;

        expect(axis.min).toBeLessThan(0);
        expect(axis.max).toBeGreaterThan(25);
        expect(axis.at(axis.min)).toBe(0);
        expect(axis.at(axis.max)).toBe(100);
        expect(axis.at(5)).toBeLessThan(axis.at(10));
    });

    it('is null when no fund has a range', () => {
        expect(rangeAxis([null, null])).toBeNull();
    });
});
