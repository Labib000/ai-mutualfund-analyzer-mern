import { formatPercent, formatSignedPaise } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Text colour for a gain (green), loss (red) or zero (inherited).
 */
export function gainTone(value: number): string | false {
    if (value > 0) {
        return 'text-emerald-700 dark:text-emerald-400';
    }

    return value < 0 && 'text-red-700 dark:text-red-400';
}

/**
 * A gain or loss with its sign spelled out, so colour isn't the only cue.
 */
export default function Gain({
    paise,
    pct,
    className,
}: {
    paise: number;
    pct?: number | null;
    className?: string;
}) {
    return (
        <span className={cn('tabular-nums', gainTone(paise), className)}>
            {formatSignedPaise(paise)}
            {pct !== undefined && pct !== null && (
                <span className="ml-1 text-xs">
                    ({formatPercent(pct, { signed: true })})
                </span>
            )}
        </span>
    );
}
