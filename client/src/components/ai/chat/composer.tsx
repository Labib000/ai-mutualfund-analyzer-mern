import { AI_QUESTION_MAX } from '@hisaab/shared';
import { ArrowUp } from 'lucide-react';
import type { FormEvent, Ref } from 'react';

import { AI_DISCLAIMER } from '@/components/ai/ai-answer';
import RemainingNote from '@/components/ai/remaining-note';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/** The counter appears once a question gets long. */
const COUNTER_FROM = 400;

/** The chat input: a rounded box with the question, requests left and a round send button. */
export default function Composer({
    value,
    onChange,
    onSend,
    busy,
    placeholder,
    inputRef,
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    busy: boolean;
    placeholder: string;
    inputRef?: Ref<HTMLTextAreaElement>;
    className?: string;
}) {
    const ready = !busy && value.trim() !== '';

    function submit(event: FormEvent) {
        event.preventDefault();
        if (ready) onSend();
    }

    return (
        <form onSubmit={submit} className={cn('space-y-2', className)}>
            <div className="rounded-[26px] border bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-ring/60 focus-within:shadow-md dark:shadow-black/20">
                <textarea
                    ref={inputRef}
                    value={value}
                    onChange={(event) =>
                        onChange(event.target.value.slice(0, AI_QUESTION_MAX))
                    }
                    onKeyDown={(event) => {
                        // Phones keep Enter for new lines; they have the send button.
                        const touch =
                            window.matchMedia('(pointer: coarse)').matches;
                        if (
                            event.key === 'Enter' &&
                            !event.shiftKey &&
                            !touch &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            if (ready) onSend();
                        }
                    }}
                    placeholder={placeholder}
                    aria-label="Your question"
                    maxLength={AI_QUESTION_MAX}
                    rows={1}
                    className="block field-sizing-content max-h-48 min-h-12 w-full resize-none bg-transparent px-5 pt-4 pb-1 text-base outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-between gap-3 py-2.5 pr-2.5 pl-5">
                    <RemainingNote short className="sm:hidden" />
                    <RemainingNote className="hidden sm:block" />
                    <div className="ml-auto flex items-center gap-3">
                        {value.length >= COUNTER_FROM && (
                            <span
                                className={cn(
                                    'text-xs tabular-nums',
                                    value.length >= AI_QUESTION_MAX
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-muted-foreground',
                                )}
                            >
                                {value.length}/{AI_QUESTION_MAX}
                            </span>
                        )}
                        <button
                            type="submit"
                            aria-label="Send"
                            disabled={!ready}
                            className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-full transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                ready
                                    ? 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-px hover:bg-primary/90 active:translate-y-0'
                                    : 'cursor-not-allowed bg-muted text-muted-foreground/70',
                            )}
                        >
                            {busy ? (
                                <Spinner className="size-4" />
                            ) : (
                                <ArrowUp
                                    className="size-[18px]"
                                    strokeWidth={2.25}
                                />
                            )}
                        </button>
                    </div>
                </div>
            </div>
            <p
                className="text-center text-xs text-muted-foreground"
                title={AI_DISCLAIMER}
            >
                AI can make mistakes and doesn&apos;t give investment advice.
            </p>
        </form>
    );
}
