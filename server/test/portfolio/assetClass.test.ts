import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { assetClassFromCategory } from '../../src/portfolio/assetClass.js';

// Port of tests/Unit/Portfolio/AssetClassTest.php
// Every category in a real AMFI file, so new AMFI wording shows up here.
const realCategories = readFileSync(
    new URL('../fixtures/amfi/categories.txt', import.meta.url),
    'utf8',
)
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split('|') as [string, string]);

describe('assetClassFromCategory', () => {
    it.each(realCategories)('maps %s to %s', (category, expected) => {
        expect(assetClassFromCategory(category)).toBe(expected);
    });

    it('covers all 77 categories', () => {
        expect(new Set(realCategories.map(([c]) => c)).size).toBe(77);
    });

    it('treats unknown categories as other', () => {
        expect(assetClassFromCategory('Something New - Brand New Fund')).toBe(
            'other',
        );
        expect(assetClassFromCategory('')).toBe('other');
    });
});
