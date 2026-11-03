import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PerformanceJson } from '@hisaab/shared';

const hints: Record<PerformanceJson['xirrStatus'], string | null> = {
    ok: null,
    short_period:
        'Annualised from less than a year of investing, so it can look higher or lower than it will over time.',
    too_recent: 'XIRR is shown once the investments span at least 30 days.',
    not_meaningful: 'Not enough transactions to work out an annual return.',
};

/**
 * XIRR with an explanation when it is missing or based on a short period.
 */
export default function XirrValue({
    performance,
    className,
}: {
    performance: Pick<PerformanceJson, 'xirrPct' | 'xirrStatus'>;
    className?: string;
}) {
    const hint = hints[performance.xirrStatus];
    const value =
        performance.xirrPct === null ? (
            '—'
        ) : (
            <span
                className={cn(
                    performance.xirrPct > 0 &&
                        'text-emerald-700 dark:text-emerald-400',
                    performance.xirrPct < 0 && 'text-red-700 dark:text-red-400',
                )}
            >
                {formatPercent(performance.xirrPct, { signed: true })}
                {performance.xirrStatus === 'short_period' && (
                    <span aria-hidden="true">*</span>
                )}
            </span>
        );

    if (hint === null) {
        return <span className={cn('tabular-nums', className)}>{value}</span>;
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    className={cn(
                        'cursor-help tabular-nums underline decoration-dotted underline-offset-4',
                        className,
                    )}
                >
                    {value}
                    <span className="sr-only"> ({hint})</span>
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{hint}</TooltipContent>
        </Tooltip>
    );
}
