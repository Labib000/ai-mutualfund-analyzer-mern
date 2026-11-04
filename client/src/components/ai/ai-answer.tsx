import { Skeleton } from '@/components/ui/skeleton';
import { toBlocks } from '@/lib/ai-text';
import { cn } from '@/lib/utils';

export const AI_DISCLAIMER =
    "AI-generated explanation for information only. It isn't investment advice; for decisions, consult a SEBI-registered investment adviser.";

/** Model text as plain React text: paragraphs, and "- " lines as lists. Nothing is read as HTML or markdown. */
export default function AiAnswer({
    text,
    className,
    showDisclaimer = true,
}: {
    text: string;
    className?: string;
    showDisclaimer?: boolean;
}) {
    return (
        <div className={cn('space-y-3', className)}>
            <div className="space-y-3 text-sm leading-relaxed break-words">
                {toBlocks(text).map((block, index) =>
                    block.type === 'list' ? (
                        <ul
                            key={index}
                            className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground"
                        >
                            {block.items.map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p key={index}>{block.text}</p>
                    ),
                )}
            </div>
            {showDisclaimer && <AiDisclaimer />}
        </div>
    );
}

export function AiDisclaimer({ className }: { className?: string }) {
    return (
        <p className={cn('text-xs text-muted-foreground', className)}>
            {AI_DISCLAIMER}
        </p>
    );
}

/** Placeholder lines while the model writes. */
export function AiThinking({
    label,
    lines = 3,
}: {
    label: string;
    lines?: number;
}) {
    const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-3/5'];
    return (
        <div className="space-y-2" role="status" aria-label={label}>
            {widths.slice(0, lines).map((w) => (
                <Skeleton key={w} className={cn('h-4', w)} />
            ))}
        </div>
    );
}
