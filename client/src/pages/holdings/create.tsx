import {
    faCircleExclamation,
    faMagnifyingGlass,
    faMagnifyingGlassMinus,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { Head } from '@/components/head';
import SchemeResultCard from '@/components/portfolio/scheme-result-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePortfolioChanged, useSchemeSearch } from '@/hooks/use-portfolio';
import { cn } from '@/lib/utils';

/** The server returns at most this many results. */
const SEARCH_LIMIT = 20;

const POPULAR_SEARCHES = [
    'parag flexi',
    'nifty 50 index',
    'elss',
    'small cap',
    'liquid',
    'balanced advantage',
    'gold',
];

const STEPS: { title: string; text: string }[] = [
    {
        title: 'Search',
        text: 'Find your fund by name, fund house or category.',
    },
    {
        title: 'Add it',
        text: 'It joins your portfolio, valued at the latest AMFI NAV.',
    },
    {
        title: 'Record investments',
        text: 'Add lump sums or a SIP. Past installments fill in automatically.',
    },
];

export default function HoldingsCreate() {
    const [params, setParams] = useSearchParams();
    const [search, setSearch] = useState(params.get('q') ?? '');
    const query = useDebouncedValue(search.trim(), 300);
    const { data, isFetching, isPending, error, refetch } =
        useSchemeSearch(query);
    const changed = usePortfolioChanged();
    const navigate = useNavigate();
    const input = useRef<HTMLInputElement>(null);

    // Keep ?q= in the URL, so back/refresh return to the same results.
    useEffect(() => {
        setParams(query ? { q: query } : {}, { replace: true });
    }, [query, setParams]);

    // "/" focuses the search from anywhere on the page.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing =
                target?.isContentEditable ||
                ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
            if (
                event.key === '/' &&
                !typing &&
                !event.metaKey &&
                !event.ctrlKey
            ) {
                event.preventDefault();
                input.current?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const fill = (text: string) => {
        setSearch(text);
        input.current?.focus();
    };

    const tooShort = search.trim().length < 2;
    const results = data?.results ?? [];
    const stale =
        search.trim() !== query || (isFetching && data?.query !== query);
    const words = (data?.query ?? query).split(/\s+/).filter(Boolean);

    return (
        <>
            <Head title="Add a fund" />

            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-6 lg:py-10">
                <header className="flex items-start gap-4">
                    <div className="space-y-1">
                        <h1 className="font-display text-2xl font-semibold tracking-tight">
                            Add a fund
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Search every active mutual fund scheme by name, fund
                            house or category.
                        </p>
                    </div>
                </header>

                <div className="relative">
                    <FontAwesomeIcon
                        icon={faMagnifyingGlass}
                        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        ref={input}
                        autoFocus
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape' && search) {
                                event.preventDefault();
                                setSearch('');
                            }
                        }}
                        placeholder="e.g. parag flexi direct growth"
                        className="h-12 rounded-xl pr-12 pl-11 text-base shadow-sm md:text-base"
                        aria-label="Search mutual fund schemes"
                    />
                    <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
                        {isFetching && !tooShort ? (
                            <Spinner className="size-4 text-muted-foreground" />
                        ) : search ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 rounded-full"
                                onClick={() => fill('')}
                                aria-label="Clear search"
                            >
                                <FontAwesomeIcon icon={faXmark} />
                            </Button>
                        ) : (
                            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">
                                /
                            </kbd>
                        )}
                    </div>
                </div>

                {tooShort ? (
                    <StartHere onPick={fill} />
                ) : error ? (
                    <Notice
                        icon={faCircleExclamation}
                        tone="destructive"
                        title="Search didn't work"
                        text="Please check your connection and try again."
                        action={
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void refetch()}
                            >
                                Try again
                            </Button>
                        }
                    />
                ) : isPending || (stale && results.length === 0) ? (
                    <ResultSkeletons />
                ) : results.length === 0 ? (
                    <Notice
                        icon={faMagnifyingGlassMinus}
                        title={`No active schemes match “${data?.query ?? query}”`}
                        text="Try fewer words, the fund house's name (e.g. “hdfc”, “sbi”), or leave out words like “fund” and “plan”."
                        action={
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fill('')}
                            >
                                Clear search
                            </Button>
                        }
                    />
                ) : (
                    <section className="space-y-3" aria-live="polite">
                        <p className="text-sm text-muted-foreground">
                            {results.length >= SEARCH_LIMIT ? (
                                <>
                                    Showing the first {SEARCH_LIMIT} matches.
                                    Add more words to narrow it down.
                                </>
                            ) : (
                                <>
                                    {results.length} fund
                                    {results.length === 1 ? '' : 's'} match “
                                    {data?.query}”
                                </>
                            )}
                        </p>
                        <ul
                            className={cn(
                                'space-y-3 transition-opacity',
                                stale && 'opacity-60',
                            )}
                        >
                            {results.map((scheme, index) => (
                                <ResultItem key={scheme.id} index={index}>
                                    <SchemeResultCard
                                        scheme={scheme}
                                        words={words}
                                        onAdded={async (created) => {
                                            await changed(created);
                                            await navigate(
                                                `/holdings/${created.holding.id}`,
                                            );
                                        }}
                                    />
                                </ResultItem>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </>
    );
}

/** Fades and lifts the first few results in, unless the user prefers reduced motion. */
function ResultItem({
    index,
    children,
}: {
    index: number;
    children: ReactNode;
}) {
    const reduce = useReducedMotion();

    return (
        <motion.li
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.2,
                delay: Math.min(index, 8) * 0.03,
                ease: 'easeOut',
            }}
        >
            {children}
        </motion.li>
    );
}

function StartHere({ onPick }: { onPick: (text: string) => void }) {
    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Popular searches
                </h2>
                <div className="flex flex-wrap gap-2">
                    {POPULAR_SEARCHES.map((text) => (
                        <button
                            key={text}
                            type="button"
                            onClick={() => onPick(text)}
                            className="rounded-full border bg-card px-3.5 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            {text}
                        </button>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    How it works
                </h2>
                <ol className="grid gap-3 sm:grid-cols-3">
                    {STEPS.map((step, index) => (
                        <li
                            key={step.title}
                            className="rounded-xl border bg-card p-4"
                        >
                            <span className="text-xs font-medium text-muted-foreground tabular-nums">
                                Step {index + 1}
                            </span>
                            <p className="mt-1 font-medium">{step.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {step.text}
                            </p>
                        </li>
                    ))}
                </ol>
            </section>
        </div>
    );
}

function ResultSkeletons() {
    return (
        <ul className="space-y-3" aria-label="Searching">
            {Array.from({ length: 4 }, (_, index) => (
                <li
                    key={index}
                    className="flex items-center gap-3 rounded-xl border bg-card p-4"
                >
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="hidden h-8 w-28 sm:block" />
                </li>
            ))}
        </ul>
    );
}

function Notice({
    icon,
    title,
    text,
    action,
    tone = 'default',
}: {
    icon: IconDefinition;
    title: string;
    text: string;
    action?: ReactNode;
    tone?: 'default' | 'destructive';
}) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
            <span
                className={cn(
                    'flex size-11 items-center justify-center rounded-full',
                    tone === 'destructive'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted text-muted-foreground',
                )}
            >
                <FontAwesomeIcon icon={icon} className="size-4" />
            </span>
            <p className="font-medium">{title}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
            {action}
        </div>
    );
}
