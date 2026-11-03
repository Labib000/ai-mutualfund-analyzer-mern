import { motion } from 'motion/react';
import { ASSET_CLASS_COLORS } from '@/components/dashboard/asset-class-colors';
import { formatPaise, formatPercent } from '@/lib/format';
import type { Allocation } from '@hisaab/shared';

/**
 * Sub-categories ranked by value, each with a thin bar in its asset class's colour.
 */
export default function CategoryList({
    categories,
}: {
    categories: Allocation['categories'];
}) {
    return (
        <ul className="space-y-3">
            {categories.map((category, index) => (
                <li
                    key={`${category.assetClass}-${category.label}`}
                    className="space-y-1.5 text-sm"
                >
                    <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1">
                            <span
                                className="block truncate"
                                title={category.label}
                            >
                                {category.label}
                            </span>
                            <span className="block text-xs text-muted-foreground tabular-nums sm:hidden">
                                {formatPaise(category.valuePaise)}
                            </span>
                        </span>
                        <span className="font-medium tabular-nums">
                            {formatPercent(category.pct)}
                        </span>
                        <span className="hidden w-28 shrink-0 text-right text-muted-foreground tabular-nums sm:block">
                            {formatPaise(category.valuePaise)}
                        </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                        <motion.div
                            className="h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${category.pct}%` }}
                            transition={{
                                duration: 0.45,
                                delay: 0.15 + index * 0.03,
                                ease: [0.22, 1, 0.36, 1],
                            }}
                            style={{
                                backgroundColor:
                                    ASSET_CLASS_COLORS[category.assetClass],
                            }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
}
