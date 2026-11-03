import { faPen, faRepeat, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { SipJson, TransactionJson, TransactionType } from '@hisaab/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import AlertError from '@/components/alert-error';
import { Head } from '@/components/head';
import PortfolioSummary from '@/components/dashboard/portfolio-summary';
import { PageError, PageLoading } from '@/components/page-state';
import Pagination from '@/components/pagination';
import AmcAvatar from '@/components/portfolio/amc-avatar';
import ConfirmDialog from '@/components/portfolio/confirm-dialog';
import PurchaseDialog from '@/components/portfolio/purchase-dialog';
import RedemptionDialog from '@/components/portfolio/redemption-dialog';
import SipDialog from '@/components/portfolio/sip-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { useBreadcrumbs } from '@/hooks/use-breadcrumbs';
import { useHolding, usePortfolioChanged } from '@/hooks/use-portfolio';
import { paginate } from '@/lib/paginate';
import { cn } from '@/lib/utils';
import {
    formatDate,
    formatNav,
    formatPaise,
    formatUnits,
    ordinal,
} from '@/lib/format';

const typeLabels: Record<TransactionType, string> = {
    purchase: 'Purchase',
    sip_installment: 'SIP',
    redemption: 'Redemption',
};

/** Shared by the rows: refresh after a change, or show why it wasn't made. */
type RowActions = {
    holdingId: string;
    today: string;
    onChanged: ReturnType<typeof usePortfolioChanged>;
    onRuleError: (errors: string[]) => void;
};

const TRANSACTIONS_PER_PAGE = 10;

export default function HoldingShow() {
    const { holdingId = '' } = useParams();
    const { data, error, refetch } = useHolding(holdingId);
    const changed = usePortfolioChanged();
    const navigate = useNavigate();
    const [actionErrors, setActionErrors] = useState<string[]>([]);

    // Transactions are paged in the browser; the page lives in ?page=.
    const [params, setParams] = useSearchParams();
    const requestedPage = Number(params.get('page') ?? '1');
    const listTop = useRef<HTMLDivElement>(null);
    const setPage = useCallback(
        (page: number) =>
            setParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (page <= 1) next.delete('page');
                    else next.set('page', String(page));
                    return next;
                },
                { replace: true },
            ),
        [setParams],
    );
    const goToPage = (page: number) => {
        setPage(page);
        const reduce = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
        ).matches;
        listTop.current?.scrollIntoView({
            behavior: reduce ? 'auto' : 'smooth',
            block: 'start',
        });
    };

    // A new purchase or redemption is usually the newest row: show page 1.
    const txnCount = data?.transactions.length;
    const lastCount = useRef(txnCount);
    useEffect(() => {
        if (
            txnCount !== undefined &&
            lastCount.current !== undefined &&
            txnCount > lastCount.current
        ) {
            setPage(1);
        }
        lastCount.current = txnCount;
    }, [txnCount, setPage]);

    const fundName = data?.holding.scheme.name;
    useBreadcrumbs(
        useMemo(
            () => [
                { title: 'Portfolio', href: '/holdings' },
                ...(fundName
                    ? [{ title: fundName, href: `/holdings/${holdingId}` }]
                    : []),
            ],
            [fundName, holdingId],
        ),
    );

    if (error) {
        return (
            <PageError
                error={error}
                retry={() => void refetch()}
                backTo={{ href: '/holdings', label: 'Back to portfolio' }}
            />
        );
    }
    if (!data) return <PageLoading />;

    const { holding, transactions, sips, today } = data;
    const { performance } = holding;
    const unitsHeld = performance.unitsHeld ?? '0';
    const hasUnits = Number(unitsHeld) > 0;
    const txnPage = paginate(
        transactions,
        requestedPage,
        TRANSACTIONS_PER_PAGE,
    );

    const actions: RowActions = {
        holdingId: holding.id,
        today,
        onChanged: async (result) => {
            setActionErrors([]);
            await changed(result);
        },
        onRuleError: setActionErrors,
    };

    return (
        <>
            <Head title={holding.scheme.name} />

            <div className="flex flex-1 flex-col gap-4 p-4 sm:gap-6 md:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                        <AmcAvatar
                            amc={holding.scheme.amc}
                            className="size-11 sm:size-12"
                        />
                        <div className="min-w-0 space-y-1">
                            <h1 className="text-lg leading-snug font-semibold tracking-tight sm:text-xl">
                                {holding.scheme.name}
                            </h1>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                                <span>{holding.scheme.amc}</span>
                                <span aria-hidden="true">·</span>
                                <span>{holding.scheme.category}</span>
                                {holding.scheme.plan && (
                                    <Badge
                                        variant="outline"
                                        className="capitalize"
                                    >
                                        {holding.scheme.plan}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                        <PurchaseDialog holdingId={holding.id} today={today} />
                        <RedemptionDialog
                            holdingId={holding.id}
                            today={today}
                            disabled={!hasUnits}
                        />
                        <SipDialog
                            holdingId={holding.id}
                            today={today}
                            trigger={
                                <Button
                                    variant="outline"
                                    className="w-full sm:w-auto"
                                >
                                    <FontAwesomeIcon icon={faRepeat} />
                                    <span className="sm:hidden">SIP</span>
                                    <span className="hidden sm:inline">
                                        Add SIP
                                    </span>
                                </Button>
                            }
                        />
                    </div>
                </div>

                {actionErrors.length > 0 && (
                    <AlertError
                        errors={actionErrors}
                        title="That change wasn't made."
                    />
                )}

                <div className="space-y-2">
                    <PortfolioSummary summary={performance} variant="fund" />
                    <p className="text-xs text-muted-foreground sm:text-sm">
                        {formatUnits(unitsHeld)} units
                        {holding.scheme.latestNav &&
                            ` · NAV ${formatNav(holding.scheme.latestNav)}`}
                        {holding.scheme.latestNavDate &&
                            ` on ${formatDate(holding.scheme.latestNavDate)}`}
                    </p>
                </div>

                {sips.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>SIPs</CardTitle>
                            <CardDescription>
                                Installments are recorded automatically once
                                each day's NAV is published.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="divide-y">
                            {sips.map((sip) => (
                                <SipRow key={sip.id} sip={sip} {...actions} />
                            ))}
                        </CardContent>
                    </Card>
                )}

                <Card
                    ref={listTop}
                    className={cn(
                        'scroll-mt-20 pb-0 sm:pb-0',
                        txnPage.pageCount <= 1 && 'lg:pb-6',
                    )}
                >
                    <CardHeader>
                        <CardTitle>
                            Transactions
                            {transactions.length > 0 && (
                                <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                                    {transactions.length}
                                </span>
                            )}
                        </CardTitle>
                        {transactions.length === 0 && (
                            <CardDescription>
                                No transactions yet. Add a purchase or a SIP to
                                get started.
                            </CardDescription>
                        )}
                    </CardHeader>
                    {transactions.length > 0 && (
                        <CardContent className="px-0 sm:px-0 lg:px-0">
                            <ul className="divide-y border-t lg:hidden">
                                {txnPage.items.map((transaction) => (
                                    <TransactionCard
                                        key={transaction.id}
                                        transaction={transaction}
                                        {...actions}
                                    />
                                ))}
                            </ul>
                            <div className="hidden overflow-x-auto lg:block">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-muted-foreground">
                                        <tr>
                                            <th className="px-6 py-2 font-medium">
                                                Date
                                            </th>
                                            <th className="px-6 py-2 font-medium">
                                                Type
                                            </th>
                                            <th className="px-6 py-2 text-right font-medium">
                                                Amount
                                            </th>
                                            <th className="px-6 py-2 text-right font-medium">
                                                NAV
                                            </th>
                                            <th className="px-6 py-2 text-right font-medium">
                                                Units
                                            </th>
                                            <th className="px-6 py-2">
                                                <span className="sr-only">
                                                    Actions
                                                </span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {txnPage.items.map((transaction) => (
                                            <TransactionRow
                                                key={transaction.id}
                                                transaction={transaction}
                                                {...actions}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <Pagination
                                page={txnPage}
                                onPageChange={goToPage}
                                className="border-t px-4 py-3 sm:px-6"
                            />
                        </CardContent>
                    )}
                </Card>

                <div className="flex justify-end">
                    <ConfirmDialog
                        action={`/holdings/${holding.id}`}
                        method="delete"
                        title="Remove this fund?"
                        description="This deletes the fund from your portfolio along with all its transactions and SIPs. This cannot be undone."
                        confirmLabel="Remove fund"
                        onSuccess={async (result) => {
                            await navigate('/holdings');
                            await changed(result);
                        }}
                        onError={setActionErrors}
                        trigger={
                            <Button
                                variant="ghost"
                                className="text-destructive"
                            >
                                <FontAwesomeIcon icon={faTrashCan} /> Remove
                                fund
                            </Button>
                        }
                    />
                </div>
            </div>
        </>
    );
}

function SipRow({
    sip,
    holdingId,
    today,
    onChanged,
    onRuleError,
}: { sip: SipJson } & RowActions) {
    const base = `/holdings/${holdingId}/sips/${sip.id}`;

    return (
        <div className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 space-y-1">
                <p className="font-medium">
                    {formatPaise(sip.amountPaise)} on the{' '}
                    {ordinal(sip.dayOfMonth)} of every month
                </p>
                <p className="text-xs text-muted-foreground">
                    Since {formatDate(sip.startDate)}
                    {sip.endDate && ` · ends ${formatDate(sip.endDate)}`}
                    {sip.nextDue &&
                        ` · next installment ${formatDate(sip.nextDue)}`}
                </p>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
                {sip.isRunning ? (
                    <Badge variant="secondary">Running</Badge>
                ) : (
                    <Badge variant="outline">Stopped</Badge>
                )}
                <SipDialog
                    holdingId={holdingId}
                    today={today}
                    sip={sip}
                    trigger={
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit SIP"
                        >
                            <FontAwesomeIcon icon={faPen} />
                        </Button>
                    }
                />
                {sip.isRunning && (
                    <ConfirmDialog
                        action={`${base}/stop`}
                        title="Stop this SIP?"
                        description="Installments up to today are kept. No new installments will be recorded."
                        confirmLabel="Stop SIP"
                        destructive={false}
                        onSuccess={onChanged}
                        onError={onRuleError}
                        trigger={
                            <Button variant="outline" size="sm">
                                Stop
                            </Button>
                        }
                    />
                )}
                <ConfirmDialog
                    action={base}
                    method="delete"
                    title="Delete this SIP?"
                    description="This deletes the SIP and every installment it recorded. To keep past installments, stop the SIP instead."
                    confirmLabel="Delete SIP"
                    onSuccess={onChanged}
                    onError={onRuleError}
                    trigger={
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete SIP"
                        >
                            <FontAwesomeIcon icon={faTrashCan} />
                        </Button>
                    }
                />
            </div>
        </div>
    );
}

function TransactionRow({
    transaction,
    holdingId,
    onChanged,
    onRuleError,
}: { transaction: TransactionJson } & RowActions) {
    const navDiffers = transaction.navDate !== transaction.txnDate;

    return (
        <tr className="border-t">
            <td className="px-6 py-3 whitespace-nowrap">
                {formatDate(transaction.txnDate)}
            </td>
            <td className="px-6 py-3">
                <Badge
                    variant={
                        transaction.type === 'redemption'
                            ? 'outline'
                            : 'secondary'
                    }
                >
                    {typeLabels[transaction.type]}
                </Badge>
            </td>
            <td className="px-6 py-3 text-right whitespace-nowrap tabular-nums">
                {formatPaise(transaction.amountPaise)}
                {transaction.stampDutyPaise > 0 && (
                    <div className="text-xs text-muted-foreground">
                        stamp duty {formatPaise(transaction.stampDutyPaise)}
                    </div>
                )}
            </td>
            <td className="px-6 py-3 text-right whitespace-nowrap tabular-nums">
                {formatNav(transaction.nav)}
                {navDiffers && (
                    <div className="text-xs text-muted-foreground">
                        NAV of {formatDate(transaction.navDate)}
                    </div>
                )}
            </td>
            <td className="px-6 py-3 text-right whitespace-nowrap tabular-nums">
                {transaction.type === 'redemption' && '−'}
                {formatUnits(transaction.units)}
                {transaction.unitsOverridden && (
                    <div className="text-xs text-muted-foreground">
                        from statement
                    </div>
                )}
            </td>
            <td className="px-6 py-3 text-right">
                <DeleteTransaction
                    transaction={transaction}
                    holdingId={holdingId}
                    onChanged={onChanged}
                    onRuleError={onRuleError}
                />
            </td>
        </tr>
    );
}

/** Below laptop width: one compact card per transaction instead of a six-column table. */
function TransactionCard({
    transaction,
    holdingId,
    onChanged,
    onRuleError,
}: { transaction: TransactionJson } & RowActions) {
    const redemption = transaction.type === 'redemption';
    const navDiffers = transaction.navDate !== transaction.txnDate;

    return (
        <li className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium whitespace-nowrap">
                            {formatDate(transaction.txnDate)}
                        </span>
                        <Badge variant={redemption ? 'outline' : 'secondary'}>
                            {typeLabels[transaction.type]}
                        </Badge>
                    </div>
                    <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
                        {formatPaise(transaction.amountPaise)}
                    </span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                    <span>
                        {redemption && '−'}
                        {formatUnits(transaction.units)} units
                        {transaction.unitsOverridden && ' (from statement)'}
                    </span>
                    <span>
                        NAV {formatNav(transaction.nav)}
                        {navDiffers && ` of ${formatDate(transaction.navDate)}`}
                    </span>
                </div>
                {transaction.stampDutyPaise > 0 && (
                    <p className="text-xs text-muted-foreground">
                        stamp duty {formatPaise(transaction.stampDutyPaise)}
                    </p>
                )}
            </div>
            <DeleteTransaction
                transaction={transaction}
                holdingId={holdingId}
                onChanged={onChanged}
                onRuleError={onRuleError}
                className="-mt-1 -mr-2"
            />
        </li>
    );
}

function DeleteTransaction({
    transaction,
    holdingId,
    onChanged,
    onRuleError,
    className,
}: {
    transaction: TransactionJson;
    holdingId: string;
    onChanged: RowActions['onChanged'];
    onRuleError: RowActions['onRuleError'];
    className?: string;
}) {
    return (
        <ConfirmDialog
            action={`/holdings/${holdingId}/transactions/${transaction.id}`}
            method="delete"
            title="Delete this transaction?"
            description={
                transaction.fromSip
                    ? 'This removes a single SIP installment. It will not be recorded again.'
                    : 'To correct a transaction, delete it and add it again.'
            }
            confirmLabel="Delete"
            onSuccess={onChanged}
            onError={onRuleError}
            trigger={
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete transaction"
                    className={className}
                >
                    <FontAwesomeIcon icon={faTrashCan} />
                </Button>
            }
        />
    );
}
