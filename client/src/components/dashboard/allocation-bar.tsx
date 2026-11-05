import { motion } from 'motion/react';
import { ASSET_CLASS_COLORS } from '@/components/dashboard/asset-class-colors';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatPaise, formatPercent } from '@/lib/format';
import type { Allocation } from '@hisaab/shared';

/**
 * Share of current value by asset class: one 100% bar plus a labelled legend,
 * so no class is identified by colour alone.
 */
export default function AllocationBar({
    classes,
}: {
    classes: Allocation['classes'];
}) {
    return (
        <div className="space-y-4">
            <div
                className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={classes
                    .map((c) => `${c.label} ${formatPercent(c.pct)}`)
                    .join(', ')}
            >
                {classes.map((assetClass, index) => (
                    <Tooltip key={assetClass.key}>
                        <TooltipTrigger asChild>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${assetClass.pct}%` }}
                                transition={{
                                    duration: 0.45,
                                    delay: 0.1 + index * 0.05,
                                    ease: [0.22, 1, 0.36, 1],
                                }}
                                tabIndex={0}
                                aria-label={`${assetClass.label} ${formatPercent(assetClass.pct)}`}
                                className="h-full min-w-1 outline-offset-2 first:rounded-l-full last:rounded-r-full"
                                style={{
                                    backgroundColor:
                                        ASSET_CLASS_COLORS[assetClass.key],
                                }}
                            />
                        </TooltipTrigger>
                        <TooltipContent>
                            <span className="font-semibold">
                                {formatPaise(assetClass.valuePaise)}
                            </span>{' '}
                            {assetClass.label} · {formatPercent(assetClass.pct)}
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>

            <ul className="space-y-2 text-sm">
                {classes.map((assetClass) => (
                    <li
                        key={assetClass.key}
                        className="flex items-center gap-2"
                    >
                        <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full"
                            style={{
                                backgroundColor:
                                    ASSET_CLASS_COLORS[assetClass.key],
                            }}
                        />
                        <span className="min-w-0 flex-1">
                            {assetClass.label}
                            <span className="block text-xs text-muted-foreground tabular-nums @md:hidden">
                                {formatPaise(assetClass.valuePaise)}
                            </span>
                        </span>
                        <span className="font-medium tabular-nums">
                            {formatPercent(assetClass.pct)}
                        </span>
                        <span className="hidden w-32 shrink-0 text-right text-muted-foreground tabular-nums @md:block">
                            {formatPaise(assetClass.valuePaise)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
