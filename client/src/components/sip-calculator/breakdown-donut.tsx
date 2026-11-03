import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { formatRupees } from '@/lib/format';

const INVESTED = 'var(--muted-foreground)';
const RETURNS = 'var(--primary)';

/** Invested vs estimated returns as a donut, with a legend that carries the numbers. */
export default function BreakdownDonut({
    invested,
    gain,
}: {
    invested: number;
    gain: number;
}) {
    const total = invested + Math.max(gain, 0);
    const rows = [
        { name: 'Invested', value: invested, color: INVESTED },
        { name: 'Est. returns', value: Math.max(gain, 0), color: RETURNS },
    ];

    return (
        <div className="flex items-center gap-4 sm:gap-6">
            <div
                className="relative size-28 shrink-0 sm:size-36"
                aria-hidden="true"
            >
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={rows}
                            dataKey="value"
                            innerRadius="68%"
                            outerRadius="100%"
                            startAngle={90}
                            endAngle={-270}
                            stroke="none"
                            isAnimationActive={false}
                        >
                            {rows.map((row) => (
                                <Cell
                                    key={row.name}
                                    fill={row.color}
                                    fillOpacity={
                                        row.name === 'Invested' ? 0.35 : 1
                                    }
                                />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-lg font-semibold tabular-nums sm:text-xl">
                        {total > 0
                            ? Math.round((Math.max(gain, 0) / total) * 100)
                            : 0}
                        %
                    </span>
                    <span className="text-[10px] text-muted-foreground sm:text-xs">
                        returns
                    </span>
                </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-3 text-sm">
                {rows.map((row) => (
                    <li key={row.name} className="space-y-0.5">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <span
                                className="size-2.5 shrink-0 rounded-full"
                                style={{
                                    backgroundColor: row.color,
                                    opacity: row.name === 'Invested' ? 0.5 : 1,
                                }}
                            />
                            {row.name}
                        </div>
                        <p className="text-base font-semibold tabular-nums sm:text-lg">
                            {formatRupees(row.value)}
                        </p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
