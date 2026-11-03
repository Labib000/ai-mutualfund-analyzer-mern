import {
    faArrowDown,
    faArrowUp,
    faChevronRight,
    faSort,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    type HoldingSummary,
    type PerformanceJson,
    assetClassFromCategory,
} from '@hisaab/shared';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import { ASSET_CLASS_COLORS } from '@/components/dashboard/asset-class-colors';
import AmcAvatar from '@/components/portfolio/amc-avatar';
import Gain from '@/components/portfolio/gain';
import XirrValue from '@/components/portfolio/xirr-value';
import { Badge } from '@/components/ui/badge';
import { formatPaise, formatPercent, formatSignedPaise } from '@/lib/format';
import { cn } from '@/lib/utils';

export type SortKey =
    | 'value'
    | 'invested'
    | 'gain'
    | 'xirr'
    | 'weight'
    | 'name';
export type SortState = { key: SortKey; dir: 'asc' | 'desc' };

/** "Equity Scheme - Flexi Cap Fund" → "Flexi Cap Fund". */
function shortCategory(category: string): string {
    const at = category.indexOf(' - ');
    return at === -1 ? category : category.slice(at + 3);
}

/**
 * Funds with invested amount, value, gain and XIRR. One card per fund up to
 * laptop width; the invested column shows on wide screens, unless `compact`.
 * The Portfolio page adds weights, sortable headers and a totals row.
 */
export default function HoldingsTable({
    holdings,
    compact = false,
    embedded = false,
    weights,
    sort,
    onSort,
    totals,
}: {
    holdings: HoldingSummary[];
    compact?: boolean;
    /** Inside a card: on phones the list runs edge to edge instead of boxing itself again. */
    embedded?: boolean;
    /** Share of the portfolio's value per holding id, %. Adds a Weight column and card bars. */
    weights?: Record<string, number>;
    sort?: SortState;
    onSort?: (key: SortKey) => void;
    /** Adds a totals footer row. */
    totals?: PerformanceJson;
}) {
    const header = (key: SortKey, label: string, className?: string) => (
        <th
            className={cn('px-4 py-3 font-medium', className)}
            aria-sort={ariaSort(sort, key)}
        >
            {onSort ? (
                <button
                    type="button"
                    onClick={() => onSort(key)}
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        sort?.key === key && 'text-foreground',
                    )}
                >
                    {label}
                    <FontAwesomeIcon
                        icon={
                            sort?.key === key
                                ? sort.dir === 'asc'
                                    ? faArrowUp
                                    : faArrowDown
                                : faSort
                        }
                        className={cn(
                            'size-3',
                            sort?.key !== key && 'opacity-40',
                        )}
                    />
                </button>
            ) : (
                label
            )}
        </th>
    );

    return (
        <>
            <ul
                className={cn(
                    'divide-y overflow-hidden lg:hidden',
                    embedded ? 'border-t' : 'rounded-xl border bg-card',
                )}
            >
                {holdings.map((holding) => (
                    <HoldingCard
                        key={holding.id}
                        holding={holding}
                        weight={weights?.[holding.id]}
                    />
                ))}
            </ul>

            <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                        <tr>
                            {header('name', 'Fund')}
                            {!compact &&
                                header(
                                    'invested',
                                    'Invested',
                                    'hidden text-right xl:table-cell',
                                )}
                            {header('value', 'Current value', 'text-right')}
                            {weights &&
                                header('weight', 'Weight', 'w-36 text-right')}
                            {header('gain', 'Gain', 'text-right')}
                            {header('xirr', 'XIRR', 'text-right')}
                            {onSort && (
                                <th className="w-8" aria-hidden="true" />
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {holdings.map((holding) => (
                            <HoldingRow
                                key={holding.id}
                                holding={holding}
                                compact={compact}
                                weight={weights?.[holding.id]}
                                chevron={!!onSort}
                            />
                        ))}
                    </tbody>
                    {totals && (
                        <tfoot className="border-t-2 bg-muted/30 font-medium">
                            <tr>
                                <td className="px-4 py-3">Total</td>
                                {!compact && (
                                    <td className="hidden px-4 py-3 text-right whitespace-nowrap tabular-nums xl:table-cell">
                                        {formatPaise(totals.investedPaise)}
                                    </td>
                                )}
                                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                                    {formatPaise(totals.valuePaise)}
                                </td>
                                {weights && (
                                    <td className="px-4 py-3 text-right tabular-nums">
                                        100%
                                    </td>
                                )}
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                    <Gain
                                        paise={totals.unrealisedGainPaise}
                                        pct={totals.absoluteReturnPct}
                                    />
                                    {totals.realisedGainPaise !== 0 && (
                                        <div className="text-xs font-normal text-muted-foreground">
                                            realised{' '}
                                            {formatSignedPaise(
                                                totals.realisedGainPaise,
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                    <XirrValue performance={totals} />
                                </td>
                                {onSort && <td />}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </>
    );
}

function ariaSort(sort: SortState | undefined, key: SortKey) {
    if (sort?.key !== key) return undefined;
    return sort.dir === 'asc' ? 'ascending' : 'descending';
}

function WeightBar({
    holding,
    weight,
}: {
    holding: HoldingSummary;
    weight: number;
}) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
                className="h-full rounded-full"
                style={{
                    width: `${Math.max(weight, 1)}%`,
                    backgroundColor:
                        ASSET_CLASS_COLORS[
                            assetClassFromCategory(holding.scheme.category)
                        ],
                }}
            />
        </div>
    );
}

function HoldingCard({
    holding,
    weight,
}: {
    holding: HoldingSummary;
    weight?: number;
}) {
    const { performance, scheme } = holding;

    return (
        <li>
            <Link
                to={`/holdings/${holding.id}`}
                className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 active:bg-muted/60"
            >
                <div className="flex items-start gap-3">
                    <AmcAvatar amc={scheme.amc} className="size-9" />
                    <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 leading-snug font-medium">
                            {scheme.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {shortCategory(scheme.category)}
                            {scheme.plan && (
                                <span className="capitalize">
                                    {' '}
                                    · {scheme.plan}
                                </span>
                            )}
                        </p>
                    </div>
                    <FontAwesomeIcon
                        icon={faChevronRight}
                        className="mt-1 size-3 shrink-0 text-muted-foreground"
                    />
                </div>
                <div className="flex items-end justify-between gap-3 pl-12">
                    <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Value</p>
                        <p className="font-semibold whitespace-nowrap tabular-nums">
                            {formatPaise(performance.valuePaise)}
                        </p>
                    </div>
                    <div className="text-right">
                        <Gain
                            paise={performance.unrealisedGainPaise}
                            pct={performance.absoluteReturnPct}
                            className="text-sm whitespace-nowrap"
                        />
                        <p className="text-xs text-muted-foreground">
                            XIRR{' '}
                            <XirrValue
                                performance={performance}
                                className="font-medium"
                            />
                        </p>
                    </div>
                </div>
                {weight !== undefined && (
                    <div className="flex items-center gap-3 pl-12">
                        <WeightBar holding={holding} weight={weight} />
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {formatPercent(weight)} of portfolio
                        </span>
                    </div>
                )}
            </Link>
        </li>
    );
}

function HoldingRow({
    holding,
    compact,
    weight,
    chevron,
}: {
    holding: HoldingSummary;
    compact: boolean;
    weight?: number;
    chevron: boolean;
}) {
    const { performance, scheme } = holding;
    const navigate = useNavigate();
    const href = `/holdings/${holding.id}`;

    return (
        <tr
            className="group cursor-pointer border-t transition-colors hover:bg-muted/40"
            // The fund name is the real link (keyboard, middle-click); the row is a bigger target.
            onClick={(event) => {
                if ((event.target as HTMLElement).closest('a, button')) return;
                void navigate(href);
            }}
        >
            <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                    <AmcAvatar amc={scheme.amc} className="size-8 rounded-lg" />
                    <div className="min-w-0">
                        <Link to={href} className="font-medium hover:underline">
                            {scheme.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{shortCategory(scheme.category)}</span>
                            {scheme.plan && (
                                <Badge variant="outline" className="capitalize">
                                    {scheme.plan}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </td>
            {!compact && (
                <Cell className="hidden xl:table-cell">
                    {formatPaise(performance.investedPaise)}
                </Cell>
            )}
            <Cell className="font-medium">
                {formatPaise(performance.valuePaise)}
            </Cell>
            {weight !== undefined && (
                <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                        <div className="w-16">
                            <WeightBar holding={holding} weight={weight} />
                        </div>
                        <span className="w-12 text-right text-xs tabular-nums">
                            {formatPercent(weight)}
                        </span>
                    </div>
                </td>
            )}
            <td className="px-4 py-3 text-right whitespace-nowrap">
                <Gain
                    paise={performance.unrealisedGainPaise}
                    pct={performance.absoluteReturnPct}
                />
                {performance.realisedGainPaise !== 0 && (
                    <div className="text-xs text-muted-foreground">
                        realised{' '}
                        {formatSignedPaise(performance.realisedGainPaise)}
                    </div>
                )}
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
                <XirrValue performance={performance} />
            </td>
            {chevron && (
                <td className="pr-4 text-muted-foreground">
                    <FontAwesomeIcon
                        icon={faChevronRight}
                        className="size-3 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                </td>
            )}
        </tr>
    );
}

function Cell({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <td
            className={cn(
                'px-4 py-3 text-right whitespace-nowrap tabular-nums',
                className,
            )}
        >
            {children}
        </td>
    );
}
