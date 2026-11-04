import { useAiRemaining } from '@/hooks/use-ai';
import { cn } from '@/lib/utils';

/**
 * "14 AI requests left this month", once an AI endpoint has said so.
 * `short` gives "14 left this month" for tight spaces.
 */
export default function RemainingNote({
    className,
    short = false,
}: {
    className?: string;
    short?: boolean;
}) {
    const remaining = useAiRemaining();
    if (remaining === null) return null;

    const noun = short
        ? 'left'
        : remaining === 1
          ? 'AI request left'
          : 'AI requests left';
    return (
        <p
            className={cn(
                'text-xs text-muted-foreground tabular-nums',
                className,
            )}
        >
            {remaining} {noun} this month
        </p>
    );
}
