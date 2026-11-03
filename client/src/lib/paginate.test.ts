import { describe, expect, it } from 'vitest';

import { pageWindow, paginate } from './paginate';

const items = Array.from({ length: 46 }, (_, i) => i + 1);

describe('paginate', () => {
    it('slices a page and reports its range', () => {
        const p = paginate(items, 2, 10);
        expect(p.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        expect(p).toMatchObject({
            page: 2,
            pageCount: 5,
            from: 11,
            to: 20,
            total: 46,
        });
    });

    it('shows a short last page', () => {
        expect(paginate(items, 5, 10)).toMatchObject({
            from: 41,
            to: 46,
            items: [41, 42, 43, 44, 45, 46],
        });
    });

    it('clamps pages out of range', () => {
        expect(paginate(items, 9, 10).page).toBe(5);
        expect(paginate(items, 0, 10).page).toBe(1);
        expect(paginate(items, -3, 10).page).toBe(1);
        expect(paginate(items, Number.NaN, 10).page).toBe(1);
    });

    it('handles an empty list', () => {
        expect(paginate([], 3, 10)).toEqual({
            items: [],
            page: 1,
            pageCount: 1,
            from: 0,
            to: 0,
            total: 0,
        });
    });
});

describe('pageWindow', () => {
    it('lists every page when there are few', () => {
        expect(pageWindow(1, 1)).toEqual([1]);
        expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('keeps the first, last and neighbours of the current page', () => {
        expect(pageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
    });

    it('keeps a steady width near the ends', () => {
        expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5, 'gap', 12]);
        expect(pageWindow(3, 12)).toEqual([1, 2, 3, 4, 5, 'gap', 12]);
        expect(pageWindow(12, 12)).toEqual([1, 'gap', 8, 9, 10, 11, 12]);
        expect(pageWindow(10, 12)).toEqual([1, 'gap', 8, 9, 10, 11, 12]);
    });
});
