import type { InsightJson } from '@hisaab/shared';

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Observations found by fixed rules on the server: no AI call, no quota
 * (port of Laravel's InsightsCard).
 */
export default function InsightsCard({
    insights,
    className,
}: {
    insights: InsightJson[];
    className?: string;
}) {
    return (
        <Card className={cn('gap-0', className)}>
            <CardHeader className="pb-2">
                <CardTitle>Insights</CardTitle>
                <CardDescription>
                    Facts Hisaab noticed in your portfolio. They describe, not
                    advise.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="divide-y">
                    {insights.map((insight) => {
                        const attention = insight.tone === 'attention';
                        return (
                            <li
                                key={`${insight.code}-${insight.title}`}
                                className="flex gap-3 py-3 last:pb-0"
                            >
                                <span
                                    className={cn(
                                        'mt-[7px] size-1.5 shrink-0 rounded-full',
                                        attention
                                            ? 'bg-red-600 dark:bg-red-400'
                                            : 'bg-muted-foreground/50',
                                    )}
                                    aria-hidden="true"
                                />
                                <div className="min-w-0 space-y-0.5">
                                    <p className="text-sm font-medium">
                                        <span className="sr-only">
                                            {attention
                                                ? 'Worth a look: '
                                                : 'Note: '}
                                        </span>
                                        {insight.title}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {insight.detail}
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </CardContent>
        </Card>
    );
}
