import type { AssetClassKey } from '@hisaab/shared';

/**
 * Fixed colour slot per asset class, so a class keeps its colour whichever classes are present.
 */
export const ASSET_CLASS_COLORS: Record<AssetClassKey, string> = {
    equity: 'var(--chart-1)',
    debt: 'var(--chart-2)',
    hybrid: 'var(--chart-3)',
    solution_oriented: 'var(--chart-4)',
    other: 'var(--chart-5)',
};
