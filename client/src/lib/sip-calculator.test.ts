import { describe, expect, it } from 'vitest';

import {
    milestones,
    projectSip,
    realValue,
    requiredMonthly,
} from './sip-calculator';

describe('projectSip', () => {
    it('matches the standard calculator: ₹5,000 a month for 10 years at 12%', () => {
        const p = projectSip({ monthly: 5000, annualReturnPct: 12, years: 10 });

        expect(p.invested).toBe(6_00_000);
        expect(p.value).toBe(11_61_695);
        expect(p.gain).toBe(5_61_695);
        expect(p.series).toHaveLength(10);
        expect(p.series.at(-1)!.value).toBe(p.value);
    });

    it('raises the installment every year with a step-up', () => {
        const p = projectSip({
            monthly: 10000,
            annualReturnPct: 12,
            years: 3,
            stepUpPct: 10,
        });

        expect(p.series.map((y) => y.monthly)).toEqual([10000, 11000, 12100]);
        expect(p.invested).toBe(12 * (10000 + 11000 + 12100));
    });

    it('gives back exactly what was invested at 0%', () => {
        const p = projectSip({ monthly: 2500, annualReturnPct: 0, years: 4 });
        expect(p.value).toBe(p.invested);
        expect(p.multiplier).toBe(1);
    });

    it('handles the extremes', () => {
        expect(
            projectSip({ monthly: 500, annualReturnPct: 1, years: 1 }).invested,
        ).toBe(6000);
        const big = projectSip({
            monthly: 5_00_000,
            annualReturnPct: 30,
            years: 40,
            stepUpPct: 25,
        });
        expect(Number.isFinite(big.value)).toBe(true);
        expect(Number.isInteger(big.value)).toBe(true);
    });
});

describe('requiredMonthly', () => {
    it('finds an installment that reaches the target', () => {
        const input = {
            target: 1_00_00_000,
            annualReturnPct: 12,
            years: 15,
            stepUpPct: 5,
        };
        const monthly = requiredMonthly(input);

        expect(monthly % 100).toBe(0);
        expect(projectSip({ ...input, monthly }).value).toBeGreaterThanOrEqual(
            input.target,
        );
        expect(
            projectSip({ ...input, monthly: monthly - 100 }).value,
        ).toBeLessThan(input.target);
    });
});

describe('realValue and milestones', () => {
    it("discounts to today's money", () => {
        expect(realValue(1_00_000, 6, 0)).toBe(1_00_000);
        expect(realValue(1_79_085, 6, 10)).toBe(1_00_000);
    });

    it('lists crossings and the year returns overtake contributions', () => {
        const p = projectSip({
            monthly: 10000,
            annualReturnPct: 12,
            years: 25,
        });
        const marks = milestones(p.series, 10);

        expect(marks.map((m) => m.label)).toContain('Crosses ₹1 Cr');
        expect(marks.some((m) => m.label.startsWith('Returns overtake'))).toBe(
            true,
        );
        expect(marks.map((m) => m.year)).toEqual(
            marks.map((m) => m.year).sort((a, b) => a - b),
        );
        expect(milestones(p.series, 3)).toHaveLength(3);
    });
});
