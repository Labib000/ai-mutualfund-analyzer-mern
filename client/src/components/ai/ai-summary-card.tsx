import type { AiReportResponse } from '@hisaab/shared';
import { AnimatePresence, motion } from 'motion/react';

import AiAnswer, { AiThinking } from '@/components/ai/ai-answer';
import RemainingNote from '@/components/ai/remaining-note';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { useAiRequest } from '@/hooks/use-ai';
import { formatDateTime } from '@/lib/format';

const fade = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.2 },
};

/** "Summarise my portfolio" on the dashboard (port of Laravel's AiSummaryCard). */
export default function AiSummaryCard() {
    const ai = useAiRequest<AiReportResponse>();
    const state = ai.loading
        ? 'loading'
        : ai.error
          ? 'error'
          : ai.result
            ? 'result'
            : null;

    return (
        <Card className="gap-0 overflow-hidden">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                    <CardTitle>AI summary</CardTitle>
                    <CardDescription>
                        A plain-language explanation of your figures.
                    </CardDescription>
                </div>
                {ai.result ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={ai.loading}
                        onClick={() => ai.run('/ai/summary', { fresh: true })}
                        className="self-start"
                    >
                        Regenerate
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        disabled={ai.loading}
                        onClick={() => ai.run('/ai/summary')}
                        className="w-full sm:w-auto"
                    >
                        Summarise my portfolio
                    </Button>
                )}
            </CardHeader>

            <motion.div
                layout
                transition={{ duration: 0.25, ease: 'easeOut' }}
                aria-live="polite"
            >
                <AnimatePresence mode="wait" initial={false}>
                    {state && (
                        <motion.div key={state} {...fade}>
                            <CardContent className="space-y-3 pt-5">
                                {state === 'loading' ? (
                                    <AiThinking label="Writing summary" />
                                ) : state === 'error' ? (
                                    <Alert variant="destructive">
                                        <AlertDescription>
                                            {ai.error}
                                        </AlertDescription>
                                    </Alert>
                                ) : (
                                    ai.result && (
                                        <AiAnswer text={ai.result.text} />
                                    )
                                )}
                                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                    <RemainingNote />
                                    {state === 'result' && ai.result && (
                                        <p className="text-xs text-muted-foreground">
                                            Generated{' '}
                                            {formatDateTime(
                                                ai.result.generatedAt,
                                            )}
                                            {ai.result.cached &&
                                                ' · saved copy, no request used'}
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </Card>
    );
}
