/**
 * The compare page's sheet: one full-width table-like surface with the funds
 * pinned along the top, headed bands for each section, and a row per figure.
 * Every row shares one grid, so values always sit under their fund.
 */
import { type SchemeSummary, shortSchemeName } from '@hisaab/shared';
import { Plus, X } from 'lucide-react';
import { type CSSProperties, type ReactNode, createContext, use } from 'react';
import { Link } from 'react-router';

import { categoryName } from '@/components/compare/fund-picker';
import AmcAvatar from '@/components/portfolio/amc-avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { bestOf } from '@/lib/compare';
import { cn } from '@/lib/utils';

export type SheetFund = {
    id: string;
    color: string;
    /** Null while the fund is loading. */
    scheme: SchemeSummary | null;
    holdingId: string | null;
};

export type Cell = {
    value: ReactNode;
    /** The number "best in row" compares; null when there's no figure. */
    sort?: number | null;
    sub?: ReactNode;
};

/** A slot whose figures haven't arrived yet. */
export const LOADING_CELL: Cell = { value: <Skeleton className="h-4 w-16" /> };

const DASH = <span className="text-muted-foreground">—</span>;
export const EMPTY_CELL: Cell = { value: DASH, sort: null };

/** Columns after the label: one per fund plus the add slots. */
const Columns = createContext(1);

/** Label column (from lg) plus one column per slot; below lg the label takes its own line. */
const GRID =
    'grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] lg:grid-cols-[minmax(11rem,1.1fr)_repeat(var(--cols),minmax(0,1fr))]';

export function Sheet({
    columns,
    children,
}: {
    columns: number;
    children: ReactNode;
}) {
    return (
        <Columns value={columns}>
            {/* No overflow clipping: the fund header has to stay sticky. */}
            <div
                className="rounded-xl border bg-card text-card-foreground shadow-xs [&>*:last-child]:rounded-b-xl [&>*:last-child]:border-b-0"
                style={{ '--cols': columns } as CSSProperties}
            >
                {children}
            </div>
        </Columns>
    );
}

/** The funds, pinned under the app header while the sheet scrolls past. */
export function SheetHeader({
    funds,
    addSlots,
    onAdd,
    onRemove,
}: {
    funds: SheetFund[];
    addSlots: number;
    onAdd: () => void;
    onRemove: (id: string) => void;
}) {
    return (
        <div
            className={cn(
                GRID,
                'sticky top-16 z-10 rounded-t-xl border-b bg-card md:top-14',
            )}
        >
            <div className="hidden flex-col justify-end px-5 py-4 lg:flex">
                <p className="text-sm font-medium">Funds</p>
                <p className="text-xs text-muted-foreground">
                    {funds.length} of {funds.length + addSlots}
                </p>
            </div>
            {funds.map((fund) => (
                <FundCell
                    key={fund.id}
                    fund={fund}
                    onRemove={() => onRemove(fund.id)}
                />
            ))}
            {Array.from({ length: addSlots }, (_, i) => (
                <div key={`add-${i}`} className="p-2 lg:p-3">
                    <button
                        type="button"
                        onClick={onAdd}
                        className="flex h-full min-h-14 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.03] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <Plus className="size-4" />
                        <span className="hidden sm:inline">Add fund</span>
                        <span className="sm:hidden">Add</span>
                    </button>
                </div>
            ))}
        </div>
    );
}

function FundCell({
    fund,
    onRemove,
}: {
    fund: SheetFund;
    onRemove: () => void;
}) {
    const scheme = fund.scheme;

    return (
        <div className="relative min-w-0 px-2.5 pt-4 pb-3 sm:px-3 lg:px-4">
            <span
                aria-hidden="true"
                className="absolute inset-x-2.5 top-0 h-[3px] rounded-b-full sm:inset-x-3 lg:inset-x-4"
                style={{ backgroundColor: fund.color }}
            />
            {scheme ? (
                <div className="flex items-start gap-2.5">
                    <AmcAvatar
                        amc={scheme.amc}
                        className="hidden size-9 rounded-xl lg:flex"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="line-clamp-3 pr-4 text-xs leading-snug font-medium sm:line-clamp-2 sm:pr-0 sm:text-sm">
                            {/* Narrow phone columns: drop the trailing "Fund". */}
                            <span className="sm:hidden">
                                {shortSchemeName(scheme.name).replace(
                                    / Fund$/,
                                    '',
                                )}
                            </span>
                            <span className="hidden sm:inline">
                                {shortSchemeName(scheme.name)}
                            </span>
                        </p>
                        <p className="hidden truncate text-xs text-muted-foreground lg:block">
                            {categoryName(scheme.category)}
                            {scheme.plan &&
                                ` · ${scheme.plan[0]!.toUpperCase()}${scheme.plan.slice(1)}`}
                        </p>
                        {fund.holdingId && (
                            <Link
                                to={`/holdings/${fund.holdingId}`}
                                className="hidden text-xs text-primary underline-offset-4 hover:underline lg:inline"
                            >
                                In your portfolio
                            </Link>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-0 size-6 shrink-0 rounded-full text-muted-foreground sm:static sm:-mt-1 sm:-mr-1.5 sm:size-7"
                        aria-label={`Remove ${shortSchemeName(scheme.name)}`}
                        onClick={onRemove}
                    >
                        <X className="size-3.5" />
                    </Button>
                </div>
            ) : (
                <div className="flex items-start gap-2.5">
                    <Skeleton className="hidden size-9 rounded-xl lg:block" />
                    <div className="flex-1 space-y-2 pt-0.5">
                        <Skeleton className="h-3.5 w-4/5" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                </div>
            )}
        </div>
    );
}

/** A section's heading across the whole sheet, with an optional control on the right. */
export function SectionBand({
    title,
    description,
    action,
}: {
    title: string;
    description?: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 border-b bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-5">
            <div className="min-w-0 space-y-0.5">
                <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {title}
                </h2>
                {description && (
                    <p className="text-xs text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            {action}
        </div>
    );
}

/** Anything that spans the whole sheet: the chart, notes, the empty state. */
export function SheetBlock({
    className,
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return <div className={cn('border-b', className)}>{children}</div>;
}

/** One figure for every fund. The best value (higher or lower, per `better`) is set in bold. */
export function SheetRow({
    label,
    note,
    better,
    cells,
}: {
    label: string;
    note?: string;
    better?: 'high' | 'low';
    cells: Cell[];
}) {
    const columns = use(Columns);
    const best = bestOf(
        cells.map((c) => c.sort ?? null),
        better ?? null,
    );

    return (
        <div
            className={cn(GRID, 'border-b transition-colors hover:bg-muted/30')}
        >
            <div className="col-span-full px-4 pt-3 lg:col-span-1 lg:px-5 lg:py-3">
                <p className="text-sm">
                    {label}
                    {note && (
                        <span className="text-xs text-muted-foreground lg:hidden">
                            {' '}
                            · {note}
                        </span>
                    )}
                </p>
                {note && (
                    <p className="hidden text-xs text-muted-foreground lg:block">
                        {note}
                    </p>
                )}
            </div>
            {Array.from({ length: columns }, (_, i) => {
                const cell = cells[i];
                return (
                    <div
                        key={i}
                        className="min-w-0 px-2.5 pt-1 pb-3 sm:px-3 lg:px-4 lg:py-3"
                    >
                        {cell && (
                            <>
                                <span
                                    className={cn(
                                        'block text-[13px] tabular-nums sm:text-sm',
                                        best.has(i) && 'font-semibold',
                                    )}
                                >
                                    {cell.value}
                                </span>
                                {cell.sub && (
                                    <span className="block text-xs text-muted-foreground tabular-nums">
                                        {cell.sub}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
