import type { PerformanceJson } from '@hisaab/shared';
import type { ReactNode } from 'react';

import Gain, { gainTone } from '@/components/portfolio/gain';
import XirrValue from '@/components/portfolio/xirr-value';
import { Card } from '@/components/ui/card';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatPaise, formatPercent, formatSignedPaise } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Headline figures in one panel.
 * Phones: current value as a hero with the gain under it, then invested and XIRR side by side.
 * Tablets and laptops: 2×2. Wide screens: one row of four.
 *
 * `variant="fund"` shows a single fund: its gain is the unrealised gain, with
 * realised gains as a note (the portfolio shows the total gain).
 */
export default function PortfolioSummary({
    summary,
    variant = 'portfolio',
}: {
    summary: PerformanceJson;
    variant?: 'portfolio' | 'fund';
}) {
    const fund = variant === 'fund';
    const gainPaise = fund
        ? summary.unrealisedGainPaise
        : summary.totalGainPaise;
    const returnPct = summary.absoluteReturnPct;
    const realised = summary.realisedGainPaise;

    const returnBadge = returnPct !== null && (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    className={cn(
                        'cursor-help underline decoration-dotted underline-offset-2',
                        gainTone(returnPct),
                    )}
                >
                    {formatPercent(returnPct, { signed: true })} absolute
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
                Absolute return: unrealised gain on the amount you still have
                invested.
                {realised !== 0 &&
                    (fund
                        ? ` Plus ${formatSignedPaise(realised)} realised on redemptions.`
                        : ` Total gain includes ${formatSignedPaise(realised)} realised on redemptions.`)}
            </TooltipContent>
        </Tooltip>
    );

    return (
        <Card className="gap-0 overflow-hidden py-0 sm:py-0">
            {/* 1px gaps over a border-coloured background draw the dividers for every layout. */}
            <div className="grid grid-cols-2 gap-px bg-border xl:grid-cols-4">
                <Stat
                    label="Current value"
                    className="col-span-2 sm:col-span-1"
                    valueClassName="text-3xl sm:text-2xl"
                    caption={
                        <span className="flex flex-wrap items-baseline gap-x-2 sm:hidden">
                            <Gain
                                paise={gainPaise}
                                className="text-sm font-medium"
                            />
                            {returnBadge}
                        </span>
                    }
                >
                    {formatPaise(summary.valuePaise)}
                </Stat>

                <Stat label="Invested" caption="Cost of units held">
                    {formatPaise(summary.investedPaise)}
                </Stat>

                <Stat
                    label={fund ? 'Gain' : 'Total gain'}
                    className="hidden sm:flex"
                    caption={
                        <>
                            {returnBadge}
                            {fund && realised !== 0 && (
                                <span className="block">
                                    plus {formatSignedPaise(realised)} realised
                                </span>
                            )}
                        </>
                    }
                >
                    <Gain paise={gainPaise} />
                </Stat>

                <Stat label="XIRR" caption="Annualised">
                    <XirrValue performance={summary} />
                </Stat>
            </div>
        </Card>
    );
}

function Stat({
    label,
    caption,
    children,
    className,
    valueClassName,
}: {
    label: string;
    caption?: ReactNode;
    children: ReactNode;
    className?: string;
    valueClassName?: string;
}) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-1 bg-card px-4 py-4 sm:px-6 sm:py-5',
                className,
            )}
        >
            <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
            <div
                className={cn(
                    'text-lg font-semibold tracking-tight whitespace-nowrap tabular-nums sm:text-2xl xl:text-xl 2xl:text-2xl',
                    valueClassName,
                )}
            >
                {children}
            </div>
            {caption && (
                <div className="text-xs text-muted-foreground">{caption}</div>
            )}
        </div>
    );
}
