import {
    faArrowDownWideShort,
    faCircleInfo,
    faFilterCircleXmark,
    faMagnifyingGlass,
    faPlus,
    faWallet,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    ASSET_CLASSES,
    type AssetClassKey,
    type HoldingSummary,
    assetClassFromCategory,
    assetClassLabel,
} from '@hisaab/shared';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';

import { ASSET_CLASS_COLORS } from '@/components/dashboard/asset-class-colors';
import PortfolioSummary from '@/components/dashboard/portfolio-summary';
import { Head } from '@/components/head';
import { PageError, PageLoading } from '@/components/page-state';
import HoldingsTable, {
    type SortKey,
    type SortState,
} from '@/components/portfolio/holdings-table';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useHoldings } from '@/hooks/use-portfolio';
import { formatDate, formatPaise, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const SORT_LABELS: Record<SortKey, string> = {
    value: 'Current value',
    weight: 'Weight',
    invested: 'Invested',
    gain: 'Gain %',
    xirr: 'XIRR',
    name: 'Name',
};

/** Numbers sort biggest first by default; names A–Z. */
const defaultDir = (key: SortKey): SortState['dir'] =>
    key === 'name' ? 'asc' : 'desc';

function sortValue(h: HoldingSummary, key: SortKey): number | string {
    const p = h.performance;
    switch (key) {
        case 'value':
        case 'weight':
            return p.valuePaise;
        case 'invested':
            return p.investedPaise;
        case 'gain':
            return p.absoluteReturnPct ?? Number.NEGATIVE_INFINITY;
        case 'xirr':
            return p.xirrPct ?? Number.NEGATIVE_INFINITY;
        case 'name':
            return h.scheme.name.toLowerCase();
    }
}

export default function HoldingsIndex() {
    const { data, error, refetch } = useHoldings();
    const [params, setParams] = useSearchParams();

    const classParam = params.get('class');
    const assetClass = (ASSET_CLASSES as readonly string[]).includes(
        classParam ?? '',
    )
        ? (classParam as AssetClassKey)
        : null;
    const sortKey = (Object.keys(SORT_LABELS) as SortKey[]).includes(
        params.get('sort') as SortKey,
    )
        ? (params.get('sort') as SortKey)
        : 'value';
    const sort: SortState = {
        key: sortKey,
        dir:
            params.get('dir') === 'asc' || params.get('dir') === 'desc'
                ? (params.get('dir') as SortState['dir'])
                : defaultDir(sortKey),
    };
    const query = params.get('q') ?? '';

    const update = (changes: Record<string, string | null>) =>
        setParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                for (const [key, value] of Object.entries(changes)) {
                    if (value === null || value === '') next.delete(key);
                    else next.set(key, value);
                }
                return next;
            },
            { replace: true },
        );

    const holdings = data?.holdings;
    const total = data?.summary.valuePaise ?? 0;

    const counts = useMemo(() => {
        const map = new Map<AssetClassKey, number>();
        for (const h of holdings ?? []) {
            const key = assetClassFromCategory(h.scheme.category);
            map.set(key, (map.get(key) ?? 0) + 1);
        }
        return map;
    }, [holdings]);

    const weights = useMemo(
        () =>
            Object.fromEntries(
                (holdings ?? []).map((h) => [
                    h.id,
                    total > 0 ? (h.performance.valuePaise / total) * 100 : 0,
                ]),
            ),
        [holdings, total],
    );

    const visible = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const list = (holdings ?? []).filter(
            (h) =>
                (!assetClass ||
                    assetClassFromCategory(h.scheme.category) === assetClass) &&
                words.every((w) =>
                    `${h.scheme.name} ${h.scheme.amc}`
                        .toLowerCase()
                        .includes(w),
                ),
        );
        const factor = sort.dir === 'asc' ? 1 : -1;
        return [...list].sort((a, b) => {
            const x = sortValue(a, sort.key);
            const y = sortValue(b, sort.key);
            return (x < y ? -1 : x > y ? 1 : 0) * factor;
        });
    }, [holdings, assetClass, query, sort.key, sort.dir]);

    if (error) return <PageError error={error} retry={() => void refetch()} />;
    if (!data) return <PageLoading />;

    const { summary } = data;
    const all = data.holdings;
    const filtered = assetClass !== null || query.trim() !== '';
    const visibleValue = visible.reduce(
        (sum, h) => sum + h.performance.valuePaise,
        0,
    );

    const onSort = (key: SortKey) =>
        update(
            key === sort.key
                ? { sort: key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
                : { sort: key, dir: defaultDir(key) },
        );
    const clearFilters = () => update({ class: null, q: null });

    return (
        <>
            <Head title="Portfolio" />

            <div className="flex flex-1 flex-col gap-4 p-4 sm:gap-6 md:p-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                        <div className="min-w-0 space-y-1">
                            <h1 className="font-display text-xl font-semibold tracking-tight sm:text-3xl">
                                Portfolio
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {all.length > 0
                                    ? `${all.length} fund${all.length === 1 ? '' : 's'}${summary.valuedOn ? ` · valued at NAVs up to ${formatDate(summary.valuedOn)}` : ''}`
                                    : 'Add the mutual funds you hold to start tracking them.'}
                            </p>
                        </div>
                    </div>
                    {all.length > 0 && (
                        <Button
                            asChild
                            className="shrink-0"
                            aria-label="Add fund"
                        >
                            <Link to="/holdings/create">
                                <FontAwesomeIcon icon={faPlus} />
                                <span className="hidden sm:inline">
                                    Add fund
                                </span>
                            </Link>
                        </Button>
                    )}
                </div>

                {all.length === 0 ? (
                    <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed bg-card px-4 py-12 text-center sm:px-6 sm:py-20">
                        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <FontAwesomeIcon
                                icon={faWallet}
                                className="size-5"
                            />
                        </span>
                        <div className="max-w-sm space-y-2">
                            <p className="text-lg font-semibold">
                                No funds yet
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Search for a scheme, then record your purchases
                                and SIPs.
                            </p>
                        </div>
                        <Button asChild>
                            <Link to="/holdings/create">
                                <FontAwesomeIcon icon={faPlus} /> Add your first
                                fund
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        <PortfolioSummary summary={summary} />

                        <section className="space-y-3">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                {/* Asset class chips; they scroll sideways on phones. */}
                                <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
                                    <FilterChip
                                        active={assetClass === null}
                                        onClick={() => update({ class: null })}
                                        label="All"
                                        count={all.length}
                                    />
                                    {ASSET_CLASSES.filter((key) =>
                                        counts.has(key),
                                    ).map((key) => (
                                        <FilterChip
                                            key={key}
                                            active={assetClass === key}
                                            onClick={() =>
                                                update({
                                                    class:
                                                        assetClass === key
                                                            ? null
                                                            : key,
                                                })
                                            }
                                            label={assetClassLabel(key)}
                                            count={counts.get(key)!}
                                            color={ASSET_CLASS_COLORS[key]}
                                        />
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    {all.length > 3 && (
                                        <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
                                            <FontAwesomeIcon
                                                icon={faMagnifyingGlass}
                                                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                                            />
                                            <Input
                                                value={query}
                                                onChange={(e) =>
                                                    update({
                                                        q: e.target.value,
                                                    })
                                                }
                                                placeholder="Search your funds"
                                                aria-label="Search your funds"
                                                className="pr-8 pl-9"
                                            />
                                            {query && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        update({ q: null })
                                                    }
                                                    aria-label="Clear search"
                                                    className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                                                >
                                                    <FontAwesomeIcon
                                                        icon={faXmark}
                                                        className="size-3"
                                                    />
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Wide screens sort from the column headers instead. */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className="shrink-0 lg:hidden"
                                            >
                                                <FontAwesomeIcon
                                                    icon={faArrowDownWideShort}
                                                />
                                                <span className="hidden sm:inline">
                                                    {SORT_LABELS[sort.key]}
                                                </span>
                                                <span className="sm:hidden">
                                                    Sort
                                                </span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            align="end"
                                            className="w-48"
                                        >
                                            <DropdownMenuLabel>
                                                Sort by
                                            </DropdownMenuLabel>
                                            <DropdownMenuRadioGroup
                                                value={sort.key}
                                                onValueChange={(key) =>
                                                    update({
                                                        sort: key,
                                                        dir: defaultDir(
                                                            key as SortKey,
                                                        ),
                                                    })
                                                }
                                            >
                                                {(
                                                    [
                                                        'value',
                                                        'gain',
                                                        'xirr',
                                                        'invested',
                                                        'name',
                                                    ] as SortKey[]
                                                ).map((key) => (
                                                    <DropdownMenuRadioItem
                                                        key={key}
                                                        value={key}
                                                    >
                                                        {SORT_LABELS[key]}
                                                    </DropdownMenuRadioItem>
                                                ))}
                                            </DropdownMenuRadioGroup>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuRadioGroup
                                                value={sort.dir}
                                                onValueChange={(dir) =>
                                                    update({
                                                        sort: sort.key,
                                                        dir,
                                                    })
                                                }
                                            >
                                                <DropdownMenuRadioItem value="desc">
                                                    {sort.key === 'name'
                                                        ? 'Z to A'
                                                        : 'Highest first'}
                                                </DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="asc">
                                                    {sort.key === 'name'
                                                        ? 'A to Z'
                                                        : 'Lowest first'}
                                                </DropdownMenuRadioItem>
                                            </DropdownMenuRadioGroup>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            {filtered && visible.length > 0 && (
                                <p className="text-sm text-muted-foreground">
                                    {visible.length} of {all.length} funds ·{' '}
                                    <span className="font-medium text-foreground tabular-nums">
                                        {formatPaise(visibleValue)}
                                    </span>{' '}
                                    (
                                    {formatPercent(
                                        total > 0
                                            ? (visibleValue / total) * 100
                                            : 0,
                                    )}{' '}
                                    of your portfolio)
                                </p>
                            )}

                            {visible.length === 0 ? (
                                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center">
                                    <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                        <FontAwesomeIcon
                                            icon={faFilterCircleXmark}
                                            className="size-4"
                                        />
                                    </span>
                                    <p className="font-medium">
                                        No{' '}
                                        {assetClass
                                            ? `${assetClassLabel(assetClass).toLowerCase()} `
                                            : ''}
                                        funds
                                        {query ? ` match “${query}”` : ''}
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={clearFilters}
                                    >
                                        Clear filters
                                    </Button>
                                </div>
                            ) : (
                                <HoldingsTable
                                    holdings={visible}
                                    weights={weights}
                                    sort={sort}
                                    onSort={onSort}
                                    totals={filtered ? undefined : summary}
                                />
                            )}
                        </section>

                        <div className="flex gap-3 rounded-xl border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                            <FontAwesomeIcon
                                icon={faCircleInfo}
                                className="mt-0.5 size-4 shrink-0 text-primary"
                            />
                            <p>
                                <strong className="font-medium text-foreground">
                                    Invested
                                </strong>{' '}
                                is the cost of the units you still hold, oldest
                                units sold first.{' '}
                                <strong className="font-medium text-foreground">
                                    Gain
                                </strong>{' '}
                                is current value minus invested; realised gains
                                from redemptions are shown under it.{' '}
                                <strong className="font-medium text-foreground">
                                    Weight
                                </strong>{' '}
                                is each fund's share of your current value. An
                                asterisk (*) on XIRR means it's annualised from
                                less than a year.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

function FilterChip({
    active,
    onClick,
    label,
    count,
    color,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    count: number;
    color?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
        >
            {color && (
                <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: color }}
                />
            )}
            {label}
            <span
                className={cn(
                    'rounded-full px-1.5 text-xs tabular-nums',
                    active ? 'bg-primary/15' : 'bg-muted',
                )}
            >
                {count}
            </span>
        </button>
    );
}
