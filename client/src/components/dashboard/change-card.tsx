import {
    type AiReportResponse,
    CHANGE_PERIODS,
    type ChangeFundJson,
    type ChangePeriod,
    type PortfolioChangeJson,
    shortSchemeName,
} from '@hisaab/shared';
import { type ReactNode, useState } from 'react';

import AiAnswer, { AiThinking } from '@/components/ai/ai-answer';
import RemainingNote from '@/components/ai/remaining-note';
import Gain from '@/components/portfolio/gain';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAiRequest } from '@/hooks/use-ai';
import { formatDate, formatSignedPaise } from '@/lib/format';
import { cn } from '@/lib/utils';

const PERIOD_LABELS: Record<ChangePeriod, string> = {
    '7d': '7D',
    '30d': '30D',
    month: 'This month',
};

/**
 * How the portfolio's value moved over a period, split into new money and
 * market movement (port of Laravel's ChangeCard). The figures are computed on
 * the server; only "Explain this" uses AI.
 */
export default function ChangeCard({
    changes,
    className,
}: {
    changes: Partial<Record<ChangePeriod, PortfolioChangeJson>>;
    className?: string;
}) {
    const [period, setPeriod] = useState<ChangePeriod>('7d');
    const change = changes[period];
    if (!change) return null;

    return (
        <Card className={cn('gap-0 pb-0 sm:pb-0', className)}>
            <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between sm:pb-5">
                <div className="min-w-0 space-y-1">
                    <CardTitle>What changed</CardTitle>
                    <CardDescription>
                        {formatDate(change.from)} to {formatDate(change.to)}
                        {change.sipInstallments > 0 &&
                            ` · ${change.sipInstallments} SIP installment${change.sipInstallments === 1 ? '' : 's'} recorded`}
                    </CardDescription>
                </div>
                <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={period}
                    onValueChange={(next) =>
                        next && setPeriod(next as ChangePeriod)
                    }
                    aria-label="Period"
                    className="w-full shrink-0 sm:w-auto"
                >
                    {CHANGE_PERIODS.filter((key) => changes[key]).map((key) => (
                        <ToggleGroupItem
                            key={key}
                            value={key}
                            className="flex-1 px-3 sm:flex-none"
                        >
                            {PERIOD_LABELS[key]}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </CardHeader>

            <CardContent className="px-0 sm:px-0">
                <dl className="grid grid-cols-1 gap-px border-y bg-border sm:grid-cols-3">
                    <Figure label="Change in value">
                        <Gain paise={change.endPaise - change.startPaise} />
                    </Figure>
                    <Figure
                        label="New money"
                        note="purchases and SIPs, less redemptions"
                    >
                        <span className="tabular-nums">
                            {formatSignedPaise(change.netFlowPaise)}
                        </span>
                    </Figure>
                    <Figure label="Market movement">
                        <Gain
                            paise={change.marketPaise}
                            pct={change.marketPct}
                        />
                    </Figure>
                </dl>

                {(change.best || change.worst) && (
                    <div className="grid gap-x-6 gap-y-3 px-4 py-4 text-sm sm:grid-cols-2 sm:px-6 sm:py-5">
                        {change.best && (
                            <Mover label="Moved most" fund={change.best} />
                        )}
                        {change.worst && (
                            <Mover label="Moved least" fund={change.worst} />
                        )}
                    </div>
                )}

                <Explain key={period} period={period} />
            </CardContent>
        </Card>
    );
}

function Figure({
    label,
    note,
    children,
}: {
    label: string;
    note?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex items-baseline justify-between gap-3 bg-card px-4 py-3 sm:block sm:space-y-1 sm:px-6 sm:py-4">
            <dt className="text-sm text-muted-foreground sm:text-xs">
                {label}
                {note && (
                    <span className="hidden text-xs xl:block">{note}</span>
                )}
            </dt>
            <dd className="font-display text-base font-semibold whitespace-nowrap sm:text-lg">
                {children}
            </dd>
        </div>
    );
}

function Mover({ label, fund }: { label: string; fund: ChangeFundJson }) {
    return (
        <div className="min-w-0 space-y-0.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-medium" title={fund.name}>
                {shortSchemeName(fund.name)}
            </p>
            <Gain
                paise={fund.marketPaise}
                pct={fund.marketPct}
                className="text-sm whitespace-nowrap"
            />
        </div>
    );
}

/** An AI explanation of the selected period's change (the digest). */
function Explain({ period }: { period: ChangePeriod }) {
    const ai = useAiRequest<AiReportResponse>();

    return (
        <div
            className="space-y-3 border-t px-4 py-4 sm:px-6 sm:py-5"
            aria-live="polite"
        >
            {ai.loading ? (
                <AiThinking label="Writing explanation" lines={2} />
            ) : (
                <>
                    {ai.error && (
                        <Alert variant="destructive">
                            <AlertDescription>{ai.error}</AlertDescription>
                        </Alert>
                    )}
                    {ai.result ? (
                        <AiAnswer text={ai.result.text} />
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => ai.run('/ai/digest', { period })}
                        >
                            {ai.error ? 'Try again' : 'Explain this'}
                        </Button>
                    )}
                    {(ai.result || ai.error) && <RemainingNote />}
                </>
            )}
        </div>
    );
}
