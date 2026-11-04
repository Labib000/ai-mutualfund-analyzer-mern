import { Check, Copy, RotateCw, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import AiAnswer from '@/components/ai/ai-answer';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { useReveal } from './use-reveal';

export function UserMessage({
    text,
    ref,
}: {
    text: string;
    ref?: React.Ref<HTMLDivElement>;
}) {
    return (
        <div ref={ref} className="flex scroll-mt-16 justify-end">
            <p className="max-w-[85%] rounded-3xl bg-foreground/[0.06] px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap sm:max-w-[70%] dark:bg-muted">
                {text}
            </p>
        </div>
    );
}

/** Answer text for reading: no box, no label. */
const READING = 'text-[15px] [&_li]:leading-7 [&_p]:leading-7 [&_ul]:space-y-1';

export function AssistantMessage({
    text,
    animate,
    onRetry,
    onRevealed,
}: {
    text: string;
    /** Reveal word by word (the newest answer only). */
    animate: boolean;
    /** Re-ask the question behind this answer (the latest answer only). */
    onRetry?: () => void;
    /** Called once the word-by-word reveal has finished. */
    onRevealed?: () => void;
}) {
    const { shown, done } = useReveal(text, animate);

    useEffect(() => {
        if (animate && done) onRevealed?.();
    }, [animate, done, onRevealed]);

    return (
        <div className="space-y-1.5">
            {/* The caret rides at the end of the last line while revealing. */}
            <AiAnswer
                text={done ? shown : `${shown.trimEnd()} ▍`}
                showDisclaimer={false}
                className={READING}
            />
            <div
                className={cn(
                    '-ml-2 flex items-center gap-0.5 transition-opacity duration-300',
                    done ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
            >
                <CopyButton text={text} />
                {onRetry && (
                    <IconAction
                        icon={RotateCw}
                        label="Retry (uses 1 request)"
                        onClick={onRetry}
                    />
                )}
            </div>
        </div>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch {
            toast.error("Couldn't copy the answer.");
        }
    }

    return (
        <IconAction
            icon={copied ? Check : Copy}
            label={copied ? 'Copied' : 'Copy'}
            onClick={copy}
        />
    );
}

function IconAction({
    icon: Icon,
    label,
    onClick,
}: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={label}
                    onClick={onClick}
                    className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                >
                    <Icon className="size-4" strokeWidth={1.75} />
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

export function ThinkingMessage() {
    return (
        <div
            role="status"
            className="flex items-center gap-2.5 py-2 text-sm text-muted-foreground"
        >
            <span className="flex gap-1" aria-hidden="true">
                {[0, 150, 300].map((delay) => (
                    <span
                        key={delay}
                        className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-duration:1s]"
                        style={{ animationDelay: `${delay}ms` }}
                    />
                ))}
            </span>
            Thinking…
        </div>
    );
}

export function ErrorMessage({
    message,
    onRetry,
}: {
    message: string;
    onRetry: () => void;
}) {
    return (
        <div className="flex flex-col items-start gap-2 py-1 sm:flex-row sm:items-center sm:gap-4">
            <p className="text-sm text-destructive">{message}</p>
            <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={onRetry}
            >
                Try again
            </Button>
        </div>
    );
}
