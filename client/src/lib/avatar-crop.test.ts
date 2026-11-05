import { describe, expect, it } from 'vitest';

import { clampOffset, cropScale, cropSource } from './avatar-crop';

const wide = { width: 1000, height: 500 };

describe('cropScale', () => {
    it('fits the short side to the frame at zoom 1', () => {
        expect(cropScale(wide, 250, 1)).toBe(0.5);
        expect(cropScale(wide, 250, 2)).toBe(1);
    });
});

describe('clampOffset', () => {
    it('leaves an offset that keeps the frame covered', () => {
        expect(clampOffset({ x: 50, y: 0 }, wide, 250, 1)).toEqual({
            x: 50,
            y: 0,
        });
    });

    it('stops at the edges of the image', () => {
        // 500px wide on screen in a 250px frame: 125px either way, none vertically.
        expect(clampOffset({ x: 999, y: 999 }, wide, 250, 1)).toEqual({
            x: 125,
            y: 0,
        });
        expect(clampOffset({ x: -999, y: 0 }, wide, 250, 1).x).toBe(-125);
    });

    it('allows more movement when zoomed in', () => {
        expect(clampOffset({ x: 999, y: 999 }, wide, 250, 2)).toEqual({
            x: 375,
            y: 125,
        });
    });
});

describe('cropSource', () => {
    it('takes the centre square by default', () => {
        expect(cropSource(wide, 250, 1, { x: 0, y: 0 })).toEqual({
            x: 250,
            y: 0,
            size: 500,
        });
    });

    it('shows the left of the image when dragged fully right', () => {
        expect(cropSource(wide, 250, 1, { x: 125, y: 0 })).toEqual({
            x: 0,
            y: 0,
            size: 500,
        });
    });

    it('shows a smaller area when zoomed in', () => {
        expect(cropSource(wide, 250, 2, { x: 0, y: 0 })).toEqual({
            x: 375,
            y: 125,
            size: 250,
        });
    });
});
