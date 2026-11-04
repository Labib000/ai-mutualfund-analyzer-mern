/** Starter questions under the empty-state input. */
export function StarterSuggestions({
    questions,
    onPick,
}: {
    questions: string[];
    onPick: (q: string) => void;
}) {
    if (questions.length === 0) return null;

    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {questions.map((q) => (
                <button
                    key={q}
                    type="button"
                    onClick={() => onPick(q)}
                    className="rounded-2xl border bg-card/50 px-4 py-3 text-left text-sm leading-snug text-foreground/90 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                    {q}
                </button>
            ))}
        </div>
    );
}

/** Follow-up questions under the latest answer: one sideways row on phones, wrapped from sm. */
export function FollowUps({
    questions,
    onPick,
}: {
    questions: string[];
    onPick: (q: string) => void;
}) {
    if (questions.length === 0) return null;

    return (
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {questions.map((q) => (
                <button
                    key={q}
                    type="button"
                    onClick={() => onPick(q)}
                    className="max-w-[80vw] shrink-0 snap-start rounded-xl border px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:max-w-full"
                >
                    {q}
                </button>
            ))}
        </div>
    );
}
