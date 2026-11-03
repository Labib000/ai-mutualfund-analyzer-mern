import { useReducedMotion } from 'motion/react';
import { useId } from 'react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';

import { useIsMobile } from '@/hooks/use-mobile';
import { formatCompactPaise, formatRupees } from '@/lib/format';
import type { YearPoint } from '@/lib/sip-calculator';

/** Year-end value against money put in, both as filled areas. */
export default function GrowthChart({ series }: { series: YearPoint[] }) {
    const mobile = useIsMobile();
    const animate = !useReducedMotion();
    const id = useId().replace(/:/g, '');
    const data = [{ year: 0, monthly: 0, invested: 0, value: 0 }, ...series];

    return (
        <div className="-mx-1 h-56 sm:mx-0 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={data}
                    margin={{
                        top: 8,
                        right: mobile ? 4 : 8,
                        bottom: 0,
                        left: 0,
                    }}
                >
                    <defs>
                        <linearGradient
                            id={`v-${id}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0%"
                                stopColor="var(--primary)"
                                stopOpacity={0.35}
                            />
                            <stop
                                offset="100%"
                                stopColor="var(--primary)"
                                stopOpacity={0.02}
                            />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                        dataKey="year"
                        tickFormatter={(year: number) =>
                            year === 0 ? 'Now' : `${year}y`
                        }
                        tick={{
                            fill: 'var(--muted-foreground)',
                            fontSize: mobile ? 11 : 12,
                        }}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                        interval="preserveStartEnd"
                        minTickGap={mobile ? 16 : 24}
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
                        width={mobile ? 48 : 64}
                    />
                    <Tooltip
                        content={GrowthTooltip}
                        cursor={{
                            stroke: 'var(--muted-foreground)',
                            strokeWidth: 1,
                        }}
                    />
                    <Area
                        dataKey="value"
                        name="Value"
                        type="monotone"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        fill={`url(#v-${id})`}
                        isAnimationActive={animate}
                        animationDuration={500}
                    />
                    <Area
                        dataKey="invested"
                        name="Invested"
                        type="monotone"
                        stroke="var(--muted-foreground)"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        fill="var(--muted-foreground)"
                        fillOpacity={0.12}
                        isAnimationActive={animate}
                        animationDuration={500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function GrowthTooltip({ active, payload }: TooltipContentProps) {
    const point = payload?.[0]?.payload as YearPoint | undefined;
    if (!active || !point || point.year === 0) return null;

    return (
        <div className="space-y-1 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
            <p className="text-xs text-muted-foreground">
                End of year {point.year}
            </p>
            <p className="font-semibold tabular-nums">
                {formatRupees(point.value)} value
            </p>
            <p className="text-muted-foreground tabular-nums">
                {formatRupees(point.invested)} invested
            </p>
            <p className="text-xs text-emerald-700 tabular-nums dark:text-emerald-400">
                +{formatRupees(point.value - point.invested)} returns
            </p>
        </div>
    );
}
