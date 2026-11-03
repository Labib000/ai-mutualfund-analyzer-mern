/** Maps AMFI categories to asset classes (port of App\Enums\AssetClass). */
import type { AssetClassKey } from './portfolio.js';

const LABELS: Record<AssetClassKey, string> = {
    equity: 'Equity',
    debt: 'Debt',
    hybrid: 'Hybrid',
    solution_oriented: 'Solution oriented',
    other: 'Other',
};

export function assetClassLabel(key: AssetClassKey): string {
    return LABELS[key];
}

/**
 * Map an AMFI category such as "Equity Scheme - Large Cap Fund", including
 * legacy ones like "Income" or "Growth", to its asset class.
 */
export function assetClassFromCategory(category: string): AssetClassKey {
    const at = category.indexOf(' - ');
    const group = at === -1 ? category : category.slice(0, at);
    const type = at === -1 ? '' : category.slice(at + 3);

    if (['Equity Scheme', 'ELSS', 'Growth'].includes(group)) return 'equity';
    if (
        [
            'Debt Scheme',
            'Income/Debt Oriented Scheme',
            'Income',
            'Gilt',
            'Money Market',
        ].includes(group)
    ) {
        return 'debt';
    }
    if (group === 'Hybrid Scheme') return 'hybrid';
    if (group === 'Index Funds') {
        if (type === 'Equity Funds') return 'equity';
        if (type === 'Debt Funds') return 'debt';
        if (type === 'Hybrid Fund') return 'hybrid';
        return 'other';
    }
    if (
        ['Solution Oriented Scheme', 'Life Cycle Funds'].includes(group) ||
        group.startsWith('Children')
    ) {
        return 'solution_oriented';
    }
    return 'other';
}
