import { describe, expect, it } from 'vitest';

import { allocationOf } from '../../src/portfolio/allocation.js';

// Port of tests/Unit/Portfolio/AllocationTest.php
describe('allocationOf', () => {
    it('shares by asset class in fixed order and by sub-category', () => {
        const allocation = allocationOf([
            { category: 'Debt Scheme - Liquid Fund', valuePaise: 2000000 },
            { category: 'Equity Scheme - Large Cap Fund', valuePaise: 5000000 },
            { category: 'Equity Scheme - Flexi Cap Fund', valuePaise: 2000000 },
            { category: 'Equity Scheme - Large Cap Fund', valuePaise: 1000000 },
        ]);

        expect(allocation.classes).toEqual([
            { key: 'equity', label: 'Equity', valuePaise: 8000000, pct: 80 },
            { key: 'debt', label: 'Debt', valuePaise: 2000000, pct: 20 },
        ]);
        expect(allocation.categories).toEqual([
            {
                label: 'Large Cap Fund',
                assetClass: 'equity',
                valuePaise: 6000000,
                pct: 60,
            },
            {
                label: 'Flexi Cap Fund',
                assetClass: 'equity',
                valuePaise: 2000000,
                pct: 20,
            },
            {
                label: 'Liquid Fund',
                assetClass: 'debt',
                valuePaise: 2000000,
                pct: 20,
            },
        ]);
    });

    it('has shares adding up to 100', () => {
        const allocation = allocationOf([
            { category: 'Equity Scheme - Large Cap Fund', valuePaise: 1 },
            { category: 'Debt Scheme - Gilt Fund', valuePaise: 1 },
            { category: 'Hybrid Scheme - Arbitrage Fund', valuePaise: 1 },
        ]);
        const sum = allocation.classes.reduce((s, c) => s + c.pct, 0);
        expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.02);
    });

    it('leaves out funds worth nothing', () => {
        const allocation = allocationOf([
            { category: 'Equity Scheme - Large Cap Fund', valuePaise: 100 },
            { category: 'Debt Scheme - Gilt Fund', valuePaise: 0 },
        ]);
        expect(allocation.classes.map((c) => c.key)).toEqual(['equity']);
        expect(allocation.categories).toHaveLength(1);
    });

    it('is empty for an empty portfolio', () => {
        expect(allocationOf([])).toEqual({ classes: [], categories: [] });
    });

    it('keeps the name of legacy categories without a group', () => {
        const allocation = allocationOf([
            { category: 'Income', valuePaise: 100 },
        ]);
        expect(allocation.categories[0]!.label).toBe('Income');
        expect(allocation.categories[0]!.assetClass).toBe('debt');
    });
});
