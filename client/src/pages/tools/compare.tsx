import {
    COMPARE_MAX_FUNDS,
    COMPARE_SIP_RUPEES,
    type CompareFundJson,
    type CompareResponse,
    type CompareStatsJson,
    shortSchemeName,
} from '@hisaab/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import CompareChart, {
    type FundHead,
} from '@/components/compare/compare-chart';
import {
    type Cell,
    EMPTY_CELL,
    LOADING_CELL,
    SectionBand,
    Sheet,
    SheetBlock,
    type SheetFund,
    SheetHeader,
    SheetRow,
} from '@/components/compare/compare-sheet';
import { AddFundDialog, categoryName } from '@/components/compare/fund-picker';
import RangeBar from '@/components/compare/range-bar';
import { Head } from '@/components/head';
import { gainTone } from '@/components/portfolio/gain';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useHoldings } from '@/hooks/use-portfolio';
import { ApiError, api } from '@/lib/api';
import {
    PERIODS,
    type Period,
    availablePeriods,
    growth,
    parseFundIds,
    parsePeriod,
    rangeAxis,
    tint,
} from '@/lib/compare';
import {
    formatDate,
    formatNav,
    formatPercent,
    formatRupees,
} from '@/lib/format';
import { cn } from '@/lib/utils';

/** One colour per slot, shared by the slot's stripe, chart line and range bar. */
const FUND_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

const DASH = <span className="text-muted-foreground">—</span>;
const GAIN_TINT = '#10b981';
const LOSS_TINT = '#ef4444';

const monthYear = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });

function signed(pct: number) {
    return (
        <span className={cn(gainTone(pct))}>
            {formatPercent(pct, { signed: true })}
        </span>
    );
}

function returnCell(pct: number | null, sub?: ReactNode): Cell {
    return { value: pct === null ? DASH : signed(pct), sort: pct, sub };
}

function plainCell(
    value: number | null,
    format: (n: number) => string,
    sub?: ReactNode,
): Cell {
    return { value: value === null ? DASH : format(value), sort: value, sub };
}

/** A calendar-year return on a pill tinted by its size. */
function yearCell(pct: number | null): Cell {
    if (pct === null) return EMPTY_CELL;
    const { tone, strength } = tint(pct);
    return {
        sort: pct,
        value: (
            <span
                className="-ml-1.5 inline-block rounded-md px-1.5 py-0.5"
                style={{
                    backgroundColor: `color-mix(in oklab, ${tone === 'gain' ? GAIN_TINT : LOSS_TINT} ${strength}%, transparent)`,
                }}
            >
                {signed(pct)}
            </span>
        ),
    };
}

function months(from: string, to: string): string {
    const n = Math.max(
        1,
        Math.round((Date.parse(to) - Date.parse(from)) / (30.44 * 86_400_000)),
    );
    return n === 1
        ? '1 month'
        : n < 24
          ? `${n} months`
          : `${(n / 12).toFixed(1)} years`;
}

type Slot = SheetFund & { data: CompareFundJson | null };
type Loaded = Slot & { data: CompareFundJson & { stats: CompareStatsJson } };

/**
 * Up to three funds side by side on one sheet: growth, trailing, calendar-year
 * and rolling returns, risk, and a SIP check, all from published NAVs. Not in
 * Laravel.
 */
export default function Compare() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const ids = parseFundIds(params.get('funds'));
    const period = parsePeriod(params.get('period'));
    const [adding, setAdding] = useState(false);

    // Built by hand so the ids stay readable in shared links ("a,b", not "a%2Cb").
    const update = (next: { funds?: string[]; period?: Period }) => {
        const funds = next.funds ?? ids;
        const parts = [];
        if (funds.length > 0) parts.push(`funds=${funds.join(',')}`);
        parts.push(`period=${next.period ?? period}`);
        void navigate({ search: `?${parts.join('&')}` }, { replace: true });
    };

    const compare = useQuery({
        queryKey: ['compare', ids.join(',')],
        queryFn: () =>
            api<CompareResponse>(
                `/compare?${new URLSearchParams({ ids: ids.join(',') })}`,
            ),
        enabled: ids.length > 0,
        placeholderData: keepPreviousData,
        staleTime: 5 * 60_000,
        retry: false,
    });

    // While a new set loads, funds already fetched keep their figures.
    const byId = new Map(
        (compare.data?.funds ?? []).map((f) => [f.scheme.id, f]),
    );
    const slots: Slot[] = ids.map((id, i) => {
        const data = byId.get(id) ?? null;
        return {
            id,
            color: FUND_COLORS[i]!,
            scheme: data?.scheme ?? null,
            holdingId: data?.holdingId ?? null,
            data,
        };
    });
    const addSlots =
        ids.length === 0
            ? COMPARE_MAX_FUNDS
            : ids.length < COMPARE_MAX_FUNDS
              ? 1
              : 0;
    const loadingNew = compare.isFetching && slots.some((s) => !s.data);
    const failed = compare.isError && !compare.isFetching;

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            toast.success('Link copied');
        } catch {
            toast.error("Couldn't copy the link.");
        }
    }

    return (
        <>
            <Head title="Compare funds" />

            <div className="flex flex-1 flex-col gap-4 p-4 sm:gap-6 md:p-6">
                <header className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-3xl">
                            Compare funds
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Up to three funds side by side: returns,
                            consistency, risk and how a SIP would have done.
                        </p>
                    </div>
                    {ids.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={copyLink}
                            aria-label="Copy link"
                        >
                            <Link2 className="size-4" />
                            <span className="hidden sm:inline">Copy link</span>
                        </Button>
                    )}
                </header>

                <Sheet columns={ids.length + addSlots}>
                    <SheetHeader
                        funds={slots}
                        addSlots={addSlots}
                        onAdd={() => setAdding(true)}
                        onRemove={(id) =>
                            update({ funds: ids.filter((i) => i !== id) })
                        }
                    />

                    {loadingNew && (
                        <SheetBlock className="px-4 py-2.5 lg:px-5">
                            <p
                                role="status"
                                className="text-xs text-muted-foreground"
                            >
                                Loading the fund's NAV history. The first time
                                anyone compares a fund this can take up to 20
                                seconds.
                            </p>
                        </SheetBlock>
                    )}

                    {ids.length === 0 ? (
                        <EmptyState
                            onPick={(picks) => update({ funds: picks })}
                        />
                    ) : failed ? (
                        <CompareError
                            error={compare.error}
                            retry={() => compare.refetch()}
                            clear={() => update({ funds: [] })}
                        />
                    ) : (
                        <Body
                            slots={slots}
                            period={period}
                            onPeriod={(p) => update({ period: p })}
                            riskFreeRatePct={
                                compare.data?.riskFreeRatePct ?? null
                            }
                        />
                    )}
                </Sheet>

                <p className="text-xs text-muted-foreground">
                    Past performance doesn't predict future returns. Figures
                    come from published NAVs; this isn't investment advice.
                </p>
            </div>

            <Dialog open={adding} onOpenChange={setAdding}>
                {adding && (
                    <AddFundDialog
                        picked={ids}
                        similarTo={slots.find((s) => s.scheme)?.scheme ?? null}
                        onPick={(id) => {
                            update({ funds: [...ids, id] });
                            setAdding(false);
                        }}
                    />
                )}
            </Dialog>
        </>
    );
}

function Body({
    slots,
    period,
    onPeriod,
    riskFreeRatePct,
}: {
    slots: Slot[];
    period: Period;
    onPeriod: (p: Period) => void;
    riskFreeRatePct: number | null;
}) {
    const [rollingLength, setRollingLength] = useState<'y1' | 'y3'>('y3');

    /** One cell per slot: loading, no history, or the figure. */
    const cells = (
        pick: (stats: CompareStatsJson, slot: Loaded) => Cell,
    ): Cell[] =>
        slots.map((slot) =>
            !slot.data
                ? LOADING_CELL
                : slot.data.stats
                  ? pick(slot.data.stats, slot as Loaded)
                  : EMPTY_CELL,
        );
    const loaded = slots.filter((s): s is Loaded => s.data?.stats != null);
    const firstYears = loaded[0]?.data.stats.calendarYears ?? [];
    const rolling = (s: Loaded) => s.data.stats.rolling[rollingLength];
    // One axis for every fund's range, so the bars can be read against each other.
    const axis = rangeAxis(
        slots.map((s) => {
            const r = s.data?.stats?.rolling[rollingLength];
            return r ? { min: r.minPct, max: r.maxPct } : null;
        }),
    );
    const noHistory = slots.filter((s) => s.data && !s.data.stats);

    return (
        <>
            {noHistory.length > 0 && (
                <SheetBlock className="px-4 py-2.5 lg:px-5">
                    <p className="text-xs text-muted-foreground">
                        Not enough NAV history yet for{' '}
                        {noHistory
                            .map((s) => shortSchemeName(s.data!.scheme.name))
                            .join(', ')}
                        .
                    </p>
                </SheetBlock>
            )}

            <Growth
                slots={slots}
                loaded={loaded}
                period={period}
                onPeriod={onPeriod}
            />

            <SectionBand
                title="Returns"
                description="Up to each fund's latest NAV. 3 years and longer are yearly (compound) rates."
            />
            <SheetRow
                label="1 month"
                better="high"
                cells={cells((s) => returnCell(s.trailing.m1Pct))}
            />
            <SheetRow
                label="3 months"
                better="high"
                cells={cells((s) => returnCell(s.trailing.m3Pct))}
            />
            <SheetRow
                label="6 months"
                better="high"
                cells={cells((s) => returnCell(s.trailing.m6Pct))}
            />
            <SheetRow
                label="1 year"
                better="high"
                cells={cells((s) => returnCell(s.trailing.y1Pct))}
            />
            <SheetRow
                label="3 years"
                note="a year"
                better="high"
                cells={cells((s) => returnCell(s.trailing.y3Pct))}
            />
            <SheetRow
                label="5 years"
                note="a year"
                better="high"
                cells={cells((s) => returnCell(s.trailing.y5Pct))}
            />
            <SheetRow
                label="10 years"
                note="a year"
                better="high"
                cells={cells((s) => returnCell(s.trailing.y10Pct))}
            />
            <SheetRow
                label="Since launch"
                better="high"
                cells={cells((s) =>
                    returnCell(
                        s.trailing.sinceStartPct,
                        `${s.trailing.sinceStartAnnualised ? 'a year' : 'in total'}, since ${monthYear(s.since)}`,
                    ),
                )}
            />

            <SectionBand
                title="Calendar years"
                description="31 December to 31 December, and this year so far. Deeper colour, bigger move."
            />
            {firstYears.toReversed().map((y) => (
                <SheetRow
                    key={y.year}
                    label={y.partial ? `${y.year} so far` : String(y.year)}
                    better="high"
                    cells={cells((s) =>
                        yearCell(
                            s.calendarYears.find((c) => c.year === y.year)
                                ?.returnPct ?? null,
                        ),
                    )}
                />
            ))}

            <SectionBand
                title="Rolling returns"
                description={`The yearly return over every ${rollingLength === 'y1' ? '1-year' : '3-year'} stretch ending in the last ${rollingLength === 'y1' ? 5 : 10} years, one a week. A narrower range means a steadier fund.`}
                action={
                    <ToggleGroup
                        type="single"
                        size="sm"
                        variant="outline"
                        value={rollingLength}
                        onValueChange={(next) =>
                            next && setRollingLength(next as 'y1' | 'y3')
                        }
                        aria-label="Stretch length"
                        className="w-full shrink-0 bg-card sm:w-auto"
                    >
                        <ToggleGroupItem
                            value="y1"
                            className="flex-1 px-3 sm:flex-none"
                        >
                            1 year
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            value="y3"
                            className="flex-1 px-3 sm:flex-none"
                        >
                            3 years
                        </ToggleGroupItem>
                    </ToggleGroup>
                }
            />
            <SheetRow
                label="Range"
                note="worst, median and best"
                cells={cells((_s, slot) => {
                    const r = rolling(slot);
                    return r && axis
                        ? {
                              value: (
                                  <RangeBar
                                      range={{
                                          min: r.minPct,
                                          median: r.medianPct,
                                          max: r.maxPct,
                                      }}
                                      axis={axis}
                                      color={slot.color}
                                  />
                              ),
                          }
                        : EMPTY_CELL;
                })}
            />
            <SheetRow
                label="Average"
                better="high"
                cells={cells((_s, slot) =>
                    returnCell(rolling(slot)?.avgPct ?? null),
                )}
            />
            <SheetRow
                label="Median"
                better="high"
                cells={cells((_s, slot) =>
                    returnCell(rolling(slot)?.medianPct ?? null),
                )}
            />
            <SheetRow
                label="Worst"
                better="high"
                cells={cells((_s, slot) =>
                    returnCell(rolling(slot)?.minPct ?? null),
                )}
            />
            <SheetRow
                label="Best"
                better="high"
                cells={cells((_s, slot) =>
                    returnCell(rolling(slot)?.maxPct ?? null),
                )}
            />
            <SheetRow
                label="Positive"
                note="share of stretches"
                better="high"
                cells={cells((_s, slot) =>
                    plainCell(
                        rolling(slot)?.positivePct ?? null,
                        (n) => `${n}%`,
                    ),
                )}
            />
            <SheetRow
                label="Above 10% a year"
                note="share of stretches"
                better="high"
                cells={cells((_s, slot) => {
                    const r = rolling(slot);
                    return plainCell(
                        r?.above10Pct ?? null,
                        (n) => `${n}%`,
                        r ? `of ${r.windows}` : undefined,
                    );
                })}
            />

            <SectionBand
                title="Risk"
                description={`Volatility, Sharpe and Sortino use the last 3 years of weekly returns (less for younger funds)${riskFreeRatePct === null ? '' : `, against a ${riskFreeRatePct}% risk-free rate`}. The largest fall covers each fund's whole history.`}
            />
            <SheetRow
                label="Volatility"
                note="how much it swings"
                better="low"
                cells={cells((s) =>
                    plainCell(
                        s.risk.volatilityPct,
                        (n) => formatPercent(n),
                        s.risk.basisYears < 3 && s.risk.volatilityPct !== null
                            ? `over ${s.risk.basisYears} years`
                            : undefined,
                    ),
                )}
            />
            <SheetRow
                label="Sharpe ratio"
                note="return per unit of swing"
                better="high"
                cells={cells((s) =>
                    plainCell(s.risk.sharpe, (n) => n.toFixed(2)),
                )}
            />
            <SheetRow
                label="Sortino ratio"
                note="counting only the falls"
                better="high"
                cells={cells((s) =>
                    plainCell(s.risk.sortino, (n) => n.toFixed(2)),
                )}
            />
            <SheetRow
                label="Largest fall"
                note="peak to low"
                better="low"
                cells={cells((s) => ({
                    value:
                        s.risk.maxDrawdownPct > 0
                            ? formatPercent(-s.risk.maxDrawdownPct)
                            : '0.00%',
                    sort: s.risk.maxDrawdownPct,
                    sub:
                        s.risk.drawdownPeak && s.risk.drawdownTrough
                            ? `${monthYear(s.risk.drawdownPeak)} – ${monthYear(s.risk.drawdownTrough)}`
                            : undefined,
                }))}
            />
            <SheetRow
                label="Back to its peak"
                cells={cells((s) => ({
                    value: s.risk.recoveredOn
                        ? monthYear(s.risk.recoveredOn)
                        : s.risk.maxDrawdownPct > 0
                          ? 'Not yet'
                          : DASH,
                    sub:
                        s.risk.recoveredOn && s.risk.drawdownTrough
                            ? `${months(s.risk.drawdownTrough, s.risk.recoveredOn)} after the low`
                            : undefined,
                }))}
            />

            <SectionBand
                title={`SIP of ${formatRupees(COMPARE_SIP_RUPEES)} a month`}
                description="On the 1st of each month (the next working day's NAV on holidays), valued at the latest NAV, before stamp duty and taxes."
            />
            {([1, 3, 5] as const).map((years) => (
                <SheetRow
                    key={years}
                    label={years === 1 ? 'Last 1 year' : `Last ${years} years`}
                    note={`${formatRupees(COMPARE_SIP_RUPEES * 12 * years)} invested`}
                    better="high"
                    cells={cells((s) => {
                        const check = s.sip.find((c) => c.years === years);
                        return check?.valueRupees == null
                            ? EMPTY_CELL
                            : {
                                  value: formatRupees(check.valueRupees),
                                  sort: check.xirrPct,
                                  sub:
                                      check.xirrPct === null ? undefined : (
                                          <>{signed(check.xirrPct)} XIRR</>
                                      ),
                              };
                    })}
                />
            ))}

            <SectionBand
                title="About the funds"
                description="Expense ratio, fund size, exit load and holdings aren't shown: Hisaab only has NAV data."
            />
            <SheetRow
                label="Fund house"
                cells={cells((_s, slot) => ({ value: slot.data.scheme.amc }))}
            />
            <SheetRow
                label="Category"
                cells={cells((_s, slot) => ({
                    value: categoryName(slot.data.scheme.category),
                }))}
            />
            <SheetRow
                label="Plan"
                cells={cells((_s, slot) => ({
                    value: (
                        <span className="capitalize">
                            {slot.data.scheme.plan ?? '—'}
                        </span>
                    ),
                }))}
            />
            <SheetRow
                label="NAV history since"
                cells={cells((s) => ({ value: formatDate(s.since) }))}
            />
            <SheetRow
                label="Latest NAV"
                cells={cells((s) => ({
                    value: formatNav(s.latestNav),
                    sub: formatDate(s.asOf),
                }))}
            />
        </>
    );
}

function Growth({
    slots,
    loaded,
    period,
    onPeriod,
}: {
    slots: Slot[];
    loaded: Loaded[];
    period: Period;
    onPeriod: (p: Period) => void;
}) {
    const series = loaded.map((s) => s.data.stats.series);
    const available = availablePeriods(series);
    const shown = available.includes(period) ? period : 'max';
    const g = loaded.length > 0 ? growth(series, shown) : null;
    const heads: FundHead[] = loaded.map((s) => ({
        name: shortSchemeName(s.data.scheme.name),
        color: s.color,
    }));

    return (
        <>
            <SectionBand
                title={`Growth of ${formatRupees(10_000)}`}
                description={
                    g
                        ? `Invested on ${formatDate(g.start)}, valued each week to ${formatDate(g.end)}.${shown === 'max' && loaded.length > 1 ? ' Max starts when the youngest fund does.' : ''}`
                        : 'Loading…'
                }
                action={
                    <ToggleGroup
                        type="single"
                        size="sm"
                        variant="outline"
                        value={shown}
                        onValueChange={(next) =>
                            next && onPeriod(next as Period)
                        }
                        aria-label="Period"
                        className="w-full shrink-0 bg-card sm:w-auto"
                    >
                        {PERIODS.filter((p) => available.includes(p.value)).map(
                            (p) => (
                                <ToggleGroupItem
                                    key={p.value}
                                    value={p.value}
                                    className="flex-1 px-3 sm:flex-none"
                                >
                                    {p.label}
                                </ToggleGroupItem>
                            ),
                        )}
                    </ToggleGroup>
                }
            />
            <SheetBlock className="px-2 pt-5 pb-3 sm:px-4 lg:px-5">
                {g ? (
                    <CompareChart growth={g} funds={heads} />
                ) : (
                    <div className="h-64 sm:h-80 xl:h-96" />
                )}
            </SheetBlock>
            <SheetRow
                label="Ended at"
                better="high"
                cells={slots.map((slot) => {
                    if (!slot.data) return LOADING_CELL;
                    const i = loaded.findIndex((l) => l.id === slot.id);
                    const value = i === -1 || !g ? null : g.final[i];
                    if (value == null) return EMPTY_CELL;
                    return {
                        value: formatRupees(value),
                        sort: value,
                        sub: signed((value / 10_000 - 1) * 100),
                    };
                })}
            />
        </>
    );
}

function EmptyState({ onPick }: { onPick: (ids: string[]) => void }) {
    const holdings = useHoldings();
    // The user's largest holdings, as a one-click start.
    const top = (holdings.data?.holdings ?? [])
        .toSorted((a, b) => b.performance.valuePaise - a.performance.valuePaise)
        .slice(0, COMPARE_MAX_FUNDS)
        .map((h) => h.scheme.id);

    return (
        <SheetBlock className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="font-medium">Pick funds to see them side by side</p>
            <p className="max-w-md text-sm text-muted-foreground">
                Any active scheme works, including funds you don't hold. Funds
                of the same kind (two flexi caps, say) compare best.
            </p>
            {top.length >= 2 && (
                <Button
                    variant="outline"
                    className="mt-2 rounded-full"
                    onClick={() => onPick(top)}
                >
                    Compare my {top.length} largest holdings
                </Button>
            )}
        </SheetBlock>
    );
}

function CompareError({
    error,
    retry,
    clear,
}: {
    error: unknown;
    retry: () => void;
    clear: () => void;
}) {
    const unavailable = error instanceof ApiError && error.status === 422;
    return (
        <SheetBlock className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p role="alert" className="text-sm">
                {error instanceof Error
                    ? error.message
                    : 'Something went wrong.'}
            </p>
            <Button
                variant="outline"
                className="rounded-full"
                onClick={unavailable ? clear : retry}
            >
                {unavailable ? 'Start again' : 'Try again'}
            </Button>
        </SheetBlock>
    );
}
