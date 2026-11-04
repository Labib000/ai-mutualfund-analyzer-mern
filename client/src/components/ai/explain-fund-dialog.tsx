import type { ExplainFundResponse } from '@hisaab/shared';
import { useState } from 'react';

import AiAnswer, { AiThinking } from '@/components/ai/ai-answer';
import RemainingNote from '@/components/ai/remaining-note';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useAiRequest } from '@/hooks/use-ai';
import { cn } from '@/lib/utils';

/** "Explain this fund": what this kind of scheme is, from its category and past NAVs (port of Laravel's dialog). */
export default function ExplainFundDialog({
    holdingId,
    schemeName,
    className,
}: {
    holdingId: string;
    schemeName: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const ai = useAiRequest<ExplainFundResponse>();
    const explain = () => ai.run(`/holdings/${holdingId}/explain`);

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next && !ai.result && !ai.loading) void explain();
            }}
        >
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className={cn('w-full sm:w-auto', className)}
                >
                    Explain this fund
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader className="items-start pl-6 text-left">
                    <DialogTitle className="leading-snug">
                        {schemeName}
                    </DialogTitle>
                    <DialogDescription>
                        What this kind of fund is and how it works.
                    </DialogDescription>
                </DialogHeader>

                <DialogBody aria-live="polite" className="space-y-3">
                    {ai.loading ? (
                        <AiThinking label="Writing explanation" lines={4} />
                    ) : ai.error ? (
                        <div className="space-y-3">
                            <Alert variant="destructive">
                                <AlertDescription>{ai.error}</AlertDescription>
                            </Alert>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={explain}
                            >
                                Try again
                            </Button>
                        </div>
                    ) : (
                        ai.result && <AiAnswer text={ai.result.text} />
                    )}
                    <RemainingNote />
                </DialogBody>
            </DialogContent>
        </Dialog>
    );
}
