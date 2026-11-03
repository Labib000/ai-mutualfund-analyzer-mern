import { useReducedMotion } from 'motion/react';
import { useId, useMemo, useState } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import RangeFilter, { RANGE_DAYS } from '@/components/dashboard/range-filter';
import { useIsMobile } from '@/hooks/use-mobile';
import type { RangeKey } from '@/components/dashboard/range-filter';
import {
    formatAxisDate,
    formatCompactPaise,
    formatDate,
    formatPaise,
    formatSignedPaise,
} from '@/lib/format';
import type { HistoryPoint } from '@hisaab/shared';

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
    return (
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        DAY_MS
    );
}

/**
 * Current value against invested amount over time, on one rupee axis.
 * Value is the highlighted series; invested is grey context.
 */
export default function ValueChart({ history }: { history: HistoryPoint[] }) {
    const [range, setRange] = useState<RangeKey>('ALL');
    const animate = !useReducedMotion();
    const mobile = useIsMobile();
    const gradientId = `value-fill-${useId().replace(/:/g, '')}`;

    const first = history[0];
    const last = history[history.length - 1];
    const spanDays = first && last ? daysBetween(first.date, last.date) : 0;

    const points = useMemo(() => {
        if (range === 'ALL' || !last) {
            return history;
        }

        return history.filter(
            (point) => daysBetween(point.date, last.date) <= RANGE_DAYS[range],
        );
    }, [history, last, range]);

    const visibleSpan =
        points.length > 1
            ? daysBetween(points[0].date, points[points.length - 1].date)
            : 0;
    const shortAxis = visibleSpan <= RANGE_DAYS['6M'];
    const ticks = useMemo(
        () => monthTicks(points, shortAxis, mobile ? 4 : 8),
        [points, shortAxis, mobile],
    );

    if (!last) {
        return null;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
                    <LegendItem
                        label="Current value"
                        value={formatPaise(last.valuePaise)}
                    />
                    <LegendItem
                        label="Invested"
                        value={formatPaise(last.investedPaise)}
                        dashed
                    />
                </div>
                <RangeFilter
                    value={range}
                    onChange={setRange}
                    spanDays={spanDays}
                />
            </div>

            <div className="-mx-1 h-56 sm:mx-0 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={points}
                        margin={{
                            top: 8,
                            right: mobile ? 4 : 8,
                            bottom: 0,
                            left: 0,
                        }}
                        accessibilityLayer
                    >
                        <defs>
                            <linearGradient
                                id={gradientId}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor="var(--primary)"
                                    stopOpacity={0.18}
                                />
                                <stop
                                    offset="100%"
                                    stopColor="var(--primary)"
                                    stopOpacity={0}
                                />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            vertical={false}
                            stroke="var(--border)"
                            strokeWidth={1}
                        />
                        <XAxis
                            dataKey="date"
                            tickFormatter={(date: string) =>
                                formatAxisDate(date, shortAxis)
                            }
                            tick={{
                                fill: 'var(--muted-foreground)',
                                fontSize: mobile ? 11 : 12,
                            }}
                            ticks={ticks}
                            interval="preserveStartEnd"
                            tickLine={false}
                            axisLine={{ stroke: 'var(--border)' }}
                            minTickGap={24}
                        />
                        <YAxis
                            domain={[0, 'auto']}
                            tickFormatter={(paise: number) =>
                                formatCompactPaise(paise)
                            }
                            tick={{
                                fill: 'var(--muted-foreground)',
                                fontSize: mobile ? 11 : 12,
                            }}
                            tickLine={false}
                            axisLine={false}
                            width={mobile ? 44 : 64}
                        />
                        <Tooltip
                            content={ChartTooltip}
                            cursor={{
                                stroke: 'var(--muted-foreground)',
                                strokeWidth: 1,
                            }}
                        />
                        <Area
                            dataKey="valuePaise"
                            name="Current value"
                            type="monotone"
                            stroke="var(--primary)"
                            strokeWidth={2}
                            fill={`url(#${gradientId})`}
                            dot={false}
                            activeDot={{
                                r: 4,
                                strokeWidth: 2,
                                stroke: 'var(--background)',
                            }}
                            isAnimationActive={animate}
                            animationDuration={500}
                            animationEasing="ease-out"
                        />
                        <Line
                            dataKey="investedPaise"
                            name="Invested"
                            type="stepAfter"
                            stroke="var(--muted-foreground)"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={false}
                            activeDot={{
                                r: 4,
                                strokeWidth: 2,
                                stroke: 'var(--background)',
                            }}
                            isAnimationActive={animate}
                            animationDuration={500}
                            animationEasing="ease-out"
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <HistoryTable points={points} />
        </div>
    );
}

/**
 * X-axis ticks. Long ranges get one tick per month (thinned to `maxTicks`) so
 * weekly points never repeat a month label; short ranges label every point.
 * `maxTicks` is lower on phones, where long labels would collide.
 */
function monthTicks(
    points: HistoryPoint[],
    short: boolean,
    maxTicks: number,
): string[] | undefined {
    if (short) {
        return undefined;
    }

    const firstOfMonth = points
        .filter(
            (point, index) =>
                index === 0 ||
                points[index - 1].date.slice(0, 7) !== point.date.slice(0, 7),
        )
        .map((point) => point.date);
    const step = Math.ceil(firstOfMonth.length / maxTicks);

    return firstOfMonth.filter((_, index) => index % step === 0);
}

function LegendItem({
    label,
    value,
    dashed = false,
}: {
    label: string;
    value: string;
    dashed?: boolean;
}) {
    return (
        <div className="flex items-center gap-2">
            <LineKey dashed={dashed} />
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{value}</span>
        </div>
    );
}

function LineKey({ dashed = false }: { dashed?: boolean }) {
    return (
        <svg width="16" height="8" aria-hidden="true" className="shrink-0">
            <line
                x1="0"
                y1="4"
                x2="16"
                y2="4"
                strokeWidth="2"
                stroke={dashed ? 'var(--muted-foreground)' : 'var(--primary)'}
                strokeDasharray={dashed ? '4 3' : undefined}
            />
        </svg>
    );
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
    const point = payload?.[0]?.payload as HistoryPoint | undefined;

    if (!active || !point) {
        return null;
    }

    return (
        <div className="space-y-1 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
            <p className="text-xs text-muted-foreground">
                {formatDate(point.date)}
            </p>
            <TooltipRow label="Value" value={formatPaise(point.valuePaise)} />
            <TooltipRow
                label="Invested"
                value={formatPaise(point.investedPaise)}
                dashed
            />
            <p className="text-xs text-muted-foreground tabular-nums">
                Gain {formatSignedPaise(point.valuePaise - point.investedPaise)}
            </p>
        </div>
    );
}

function TooltipRow({
    label,
    value,
    dashed = false,
}: {
    label: string;
    value: string;
    dashed?: boolean;
}) {
    return (
        <div className="flex items-center gap-2">
            <LineKey dashed={dashed} />
            <span className="font-semibold tabular-nums">{value}</span>
            <span className="text-muted-foreground">{label}</span>
        </div>
    );
}

/**
 * The same data as a table, one row per month (the last point of each month).
 */
function HistoryTable({ points }: { points: HistoryPoint[] }) {
    const monthly = points.filter(
        (point, index) =>
            index === points.length - 1 ||
            points[index + 1].date.slice(0, 7) !== point.date.slice(0, 7),
    );

    return (
        <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View as table
            </summary>
            <div className="mt-3 max-h-72 overflow-auto rounded-lg border">
                <table className="w-full">
                    <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 font-medium">Date</th>
                            <th className="px-3 py-2 text-right font-medium">
                                Value
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                Invested
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                Gain
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthly
                            .slice()
                            .reverse()
                            .map((point) => (
                                <tr key={point.date} className="border-t">
                                    <td className="px-3 py-2">
                                        {formatDate(point.date)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        {formatPaise(point.valuePaise)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        {formatPaise(point.investedPaise)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        {formatSignedPaise(
                                            point.valuePaise -
                                                point.investedPaise,
                                        )}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </details>
    );
}
