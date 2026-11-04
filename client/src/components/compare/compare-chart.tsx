import { useReducedMotion } from 'motion/react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';

import { useIsMobile } from '@/hooks/use-mobile';
import { GROWTH_START, type Growth } from '@/lib/compare';
import {
    formatAxisDate,
    formatCompactPaise,
    formatDate,
    formatRupees,
} from '@/lib/format';

/** A line's label and colour. */
export type FundHead = { name: string; color: string };

type Datum = { date: string } & Record<`f${number}`, number | null>;

/** Growth of ₹10,000 in each fund, one line per fund, all starting together. */
export default function CompareChart({
    growth,
    funds,
}: {
    growth: Growth;
    funds: FundHead[];
}) {
    const mobile = useIsMobile();
    const animate = !useReducedMotion();
    const data: Datum[] = growth.points.map((p) => ({
        date: p.date,
        ...Object.fromEntries(p.values.map((v, i) => [`f${i}`, v])),
    }));
    const days =
        (Date.parse(growth.end) - Date.parse(growth.start)) / 86_400_000;

    return (
        <div className="h-64 sm:h-80 xl:h-96">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={data}
                    margin={{
                        top: 8,
                        right: mobile ? 4 : 8,
                        bottom: 0,
                        left: 0,
                    }}
                >
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(date: string) =>
                            formatAxisDate(date, days < 200)
                        }
                        tick={{
                            fill: 'var(--muted-foreground)',
                            fontSize: mobile ? 11 : 12,
                        }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        interval="preserveStartEnd"
                        minTickGap={mobile ? 24 : 40}
                    />
                    <YAxis
                        tickFormatter={(rupees: number) =>
                            formatCompactPaise(rupees * 100)
                        }
                        tick={{
                            fill: 'var(--muted-foreground)',
                            fontSize: mobile ? 11 : 12,
                        }}
                        tickLine={false}
                        axisLine={false}
                        width={mobile ? 44 : 56}
                        domain={['auto', 'auto']}
                    />
                    <ReferenceLine
                        y={GROWTH_START}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="3 3"
                        strokeOpacity={0.6}
                    />
                    <Tooltip
                        content={(props) => (
                            <GrowthTooltip {...props} funds={funds} />
                        )}
                        cursor={{
                            stroke: 'var(--muted-foreground)',
                            strokeWidth: 1,
                        }}
                    />
                    {funds.map((fund, i) => (
                        <Line
                            key={fund.name}
                            dataKey={`f${i}`}
                            name={fund.name}
                            type="monotone"
                            stroke={fund.color}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                            connectNulls
                            isAnimationActive={animate}
                            animationDuration={500}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

function GrowthTooltip({
    active,
    payload,
    funds,
}: TooltipContentProps & { funds: FundHead[] }) {
    const point = payload?.[0]?.payload as Datum | undefined;
    if (!active || !point) return null;

    return (
        <div className="max-w-64 space-y-1.5 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
            <p className="text-xs text-muted-foreground">
                {formatDate(point.date)}
            </p>
            {funds.map((fund, i) => {
                const value = point[`f${i}`];
                return (
                    <p key={fund.name} className="flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: fund.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {fund.name}
                        </span>
                        <span className="font-medium tabular-nums">
                            {value == null ? '—' : formatRupees(value)}
                        </span>
                    </p>
                );
            })}
        </div>
    );
}
