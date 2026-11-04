import type { FundStatsJson } from '@hisaab/shared';
import type { ReactNode } from 'react';

import { gainTone } from '@/components/portfolio/gain';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { formatDate, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The scheme's own past returns and risk from its NAV history, independent of
 * when the user invested (port of Laravel's FundFactsCard).
 */
export default function FundFactsCard({ stats }: { stats: FundStatsJson }) {
    return (
        <Card className="gap-0 pb-0 sm:pb-0">
            <CardHeader className="pb-4 sm:pb-5">
                <CardTitle>Fund facts</CardTitle>
                <CardDescription>
                    How the fund's NAV has moved, up to {formatDate(stats.asOf)}
                    . Past returns don't predict future returns.
                </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-0">
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl border-t bg-border sm:grid-cols-3 xl:grid-cols-6">
                    <Fact label="1 year">
                        <Return pct={stats.return1yPct} />
                    </Fact>
                    <Fact label="3 years" note="a year">
                        <Return pct={stats.cagr3yPct} />
                    </Fact>
                    <Fact label="5 years" note="a year">
                        <Return pct={stats.cagr5yPct} />
                    </Fact>
                    <Fact
                        label={`Since ${formatDate(stats.since)}`}
                        note={
                            stats.sinceStartAnnualised ? 'a year' : 'in total'
                        }
                    >
                        <Return pct={stats.sinceStartPct} />
                    </Fact>
                    <Fact label="Volatility" note="spread of weekly returns">
                        {stats.volatilityPct === null ? (
                            <span className="text-muted-foreground">—</span>
                        ) : (
                            formatPercent(stats.volatilityPct)
                        )}
                    </Fact>
                    <Fact
                        label="Largest fall"
                        note={
                            stats.drawdownPeak && stats.drawdownTrough
                                ? `${formatDate(stats.drawdownPeak)} – ${formatDate(stats.drawdownTrough)}`
                                : 'never fell below a peak'
                        }
                    >
                        {stats.maxDrawdownPct > 0
                            ? formatPercent(-stats.maxDrawdownPct)
                            : '0.00%'}
                    </Fact>
                </dl>
            </CardContent>
        </Card>
    );
}

function Fact({
    label,
    note,
    children,
}: {
    label: string;
    note?: string;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0 space-y-1 bg-card px-4 py-4 sm:px-6">
            <dt className="truncate text-xs text-muted-foreground">{label}</dt>
            <dd className="font-display text-lg font-semibold whitespace-nowrap tabular-nums">
                {children}
            </dd>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
    );
}

function Return({ pct }: { pct: number | null }) {
    if (pct === null) return <span className="text-muted-foreground">—</span>;
    return (
        <span className={cn(gainTone(pct))}>
            {formatPercent(pct, { signed: true })}
        </span>
    );
}
