import { formatCompactPaise } from '@/lib/format';
import type { Milestone } from '@/lib/sip-calculator';
import { cn } from '@/lib/utils';

type Step = {
    key: string;
    title: string;
    detail: string;
    when: string;
    tone: 'start' | 'mark' | 'goal';
};

/** The plan's milestones as a simple dotted line, from today to the final year. */
export default function MilestoneTimeline({
    milestones,
    years,
    finalValue,
    monthly,
}: {
    milestones: Milestone[];
    years: number;
    finalValue: number;
    monthly: string;
}) {
    const steps: Step[] = [
        {
            key: 'start',
            title: 'Start your SIP',
            detail: `${monthly} a month`,
            when: 'Today',
            tone: 'start',
        },
        ...milestones
            // The final year is the goal row below.
            .filter((m) => !(m.year === years && m.kind === 'corpus'))
            .map((m): Step => ({
                key: `${m.kind}-${m.label}`,
                title: m.label,
                detail: `Worth ${formatCompactPaise(m.value * 100)}`,
                when: `Year ${m.year}`,
                tone: 'mark',
            })),
        {
            key: 'end',
            title: `Reach ${formatCompactPaise(finalValue * 100)}`,
            detail: 'Final value',
            when: `Year ${years}`,
            tone: 'goal',
        },
    ];

    return (
        <ol>
            {steps.map((step, i) => (
                <li
                    key={step.key}
                    className="relative flex gap-4 pb-5 last:pb-0"
                >
                    {i < steps.length - 1 && (
                        <span
                            aria-hidden="true"
                            className="absolute top-4 bottom-0 left-[5px] w-px bg-border"
                        />
                    )}
                    <span
                        aria-hidden="true"
                        className={cn(
                            'relative mt-1.5 size-[11px] shrink-0 rounded-full',
                            step.tone === 'start' &&
                                'border-2 border-muted-foreground/50 bg-card',
                            step.tone === 'mark' && 'bg-primary/70',
                            step.tone === 'goal' &&
                                'bg-primary ring-4 ring-primary/20',
                        )}
                    />
                    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                        <div className="min-w-0">
                            <p
                                className={cn(
                                    'text-sm leading-snug',
                                    step.tone === 'goal'
                                        ? 'font-semibold'
                                        : 'font-medium',
                                )}
                            >
                                {step.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {step.detail}
                            </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {step.when}
                        </span>
                    </div>
                </li>
            ))}
        </ol>
    );
}
