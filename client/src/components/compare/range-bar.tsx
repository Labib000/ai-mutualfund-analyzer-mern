import type { RangeAxis } from '@/lib/compare';

const pct = (n: number) =>
    `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`;

/**
 * A fund's rolling returns from worst to best on an axis shared with the
 * other funds, with a dot at the median and a tick at 0%.
 */
export default function RangeBar({
    range,
    axis,
    color,
}: {
    range: { min: number; median: number; max: number };
    axis: RangeAxis;
    color: string;
}) {
    const from = axis.at(range.min);
    const to = axis.at(range.max);

    return (
        <div
            className="w-full space-y-1 pt-1"
            role="img"
            aria-label={`Worst ${pct(range.min)}, median ${pct(range.median)}, best ${pct(range.max)}`}
        >
            <div className="relative h-2 rounded-full bg-muted">
                <span
                    aria-hidden="true"
                    className="absolute -inset-y-1 w-px bg-muted-foreground/40"
                    style={{ left: `${axis.at(0)}%` }}
                />
                <span
                    aria-hidden="true"
                    className="absolute inset-y-0 rounded-full opacity-40"
                    style={{
                        left: `${from}%`,
                        width: `${Math.max(to - from, 1)}%`,
                        backgroundColor: color,
                    }}
                />
                <span
                    aria-hidden="true"
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                    style={{
                        left: `${axis.at(range.median)}%`,
                        backgroundColor: color,
                    }}
                />
            </div>
            <div
                aria-hidden="true"
                className="flex justify-between gap-1 text-[11px] text-muted-foreground tabular-nums"
            >
                <span>{pct(range.min)}</span>
                <span>{pct(range.max)}</span>
            </div>
        </div>
    );
}
