/** Share of current value by asset class and sub-category (port of App\Portfolio\Allocation). */
import {
    ASSET_CLASSES,
    type AssetClassKey,
    type Allocation,
} from '@hisaab/shared';

import { roundFloat } from '../lib/decimal.js';
import { assetClassFromCategory, assetClassLabel } from './assetClass.js';

export type AllocationInput = { category: string; valuePaise: number };

/** "Equity Scheme - Large Cap Fund" → "Large Cap Fund"; legacy categories without a group stay as they are. */
function subCategory(category: string): string {
    const at = category.indexOf(' - ');
    return at === -1 ? category : category.slice(at + 3);
}

export function allocationOf(input: readonly AllocationInput[]): Allocation {
    const holdings = input.filter((h) => h.valuePaise > 0);
    const total = holdings.reduce((sum, h) => sum + h.valuePaise, 0);

    if (total === 0) return { classes: [], categories: [] };

    const byClass = new Map<AssetClassKey, number>();
    const byCategory = new Map<
        string,
        { label: string; assetClass: AssetClassKey; valuePaise: number }
    >();

    for (const holding of holdings) {
        const assetClass = assetClassFromCategory(holding.category);
        byClass.set(
            assetClass,
            (byClass.get(assetClass) ?? 0) + holding.valuePaise,
        );

        const entry = byCategory.get(holding.category) ?? {
            label: subCategory(holding.category),
            assetClass,
            valuePaise: 0,
        };
        entry.valuePaise += holding.valuePaise;
        byCategory.set(holding.category, entry);
    }

    const pct = (value: number) => roundFloat((value / total) * 100, 2);

    return {
        classes: ASSET_CLASSES.flatMap((key) => {
            const value = byClass.get(key);
            return value === undefined
                ? []
                : [
                      {
                          key,
                          label: assetClassLabel(key),
                          valuePaise: value,
                          pct: pct(value),
                      },
                  ];
        }),
        // Biggest first; ties by label (byte order, like PHP's <=>).
        categories: [...byCategory.values()]
            .sort(
                (a, b) =>
                    b.valuePaise - a.valuePaise ||
                    (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
            )
            .map((c) => ({ ...c, pct: pct(c.valuePaise) })),
    };
}
