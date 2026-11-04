import { type SchemeSummary, shortSchemeName } from '@hisaab/shared';
import { Search } from 'lucide-react';
import { useState } from 'react';

import AmcAvatar from '@/components/portfolio/amc-avatar';
import { Button } from '@/components/ui/button';
import {
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useHoldings, useSchemeSearch } from '@/hooks/use-portfolio';
import { cn } from '@/lib/utils';

/** "Equity Scheme - Flexi Cap Fund" → "Flexi Cap Fund". */
export function categoryName(category: string): string {
    return category.includes(' - ')
        ? category.slice(category.indexOf(' - ') + 3)
        : category;
}

/**
 * Words likely to find funds of the same kind, since search matches scheme
 * names: "Flexi Cap Fund" (Direct) → "Flexi Cap direct growth".
 */
function similarQuery(scheme: SchemeSummary): string {
    let name = categoryName(scheme.category);
    // "Dynamic Asset Allocation or Balanced Advantage": funds use the second name.
    if (name.includes(' or ')) name = name.slice(name.lastIndexOf(' or ') + 4);
    name = name.replace(/\s+(Funds?|Schemes?)$/i, '');
    return [name, scheme.plan, 'growth']
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

/** Search every active scheme (or pick from the portfolio) and choose one to compare. */
export function AddFundDialog({
    picked,
    similarTo,
    onPick,
}: {
    picked: string[];
    similarTo: SchemeSummary | null;
    onPick: (id: string) => void;
}) {
    const [search, setSearch] = useState('');
    const query = useDebouncedValue(search.trim(), 300);
    const results = useSchemeSearch(query);
    const holdings = useHoldings();
    const searching = search.trim().length >= 2;

    const yours = (holdings.data?.holdings ?? []).map((h) => h.scheme);

    return (
        <DialogContent className="max-h-[85dvh] sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>Add a fund to compare</DialogTitle>
                <DialogDescription>
                    Any active scheme, whether you hold it or not.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 px-4 pt-4 pb-2 sm:px-6">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by fund name"
                        aria-label="Search funds"
                        className="h-11 rounded-xl pr-10 pl-10"
                    />
                    {searching && results.isFetching && (
                        <Spinner className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    )}
                </div>

                {!searching && similarTo && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                            Same kind as {shortSchemeName(similarTo.name)}:
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => setSearch(similarQuery(similarTo))}
                        >
                            {categoryName(similarTo.category)}
                        </Button>
                    </div>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 sm:px-4">
                {searching ? (
                    results.data && results.data.results.length > 0 ? (
                        <FundList
                            funds={results.data.results}
                            picked={picked}
                            onPick={onPick}
                        />
                    ) : results.isPending || search.trim() !== query ? null : (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            No active funds match “{query}”.
                        </p>
                    )
                ) : yours.length > 0 ? (
                    <>
                        <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                            From your portfolio
                        </p>
                        <FundList
                            funds={yours}
                            picked={picked}
                            onPick={onPick}
                        />
                    </>
                ) : null}
            </div>
        </DialogContent>
    );
}

function FundList({
    funds,
    picked,
    onPick,
}: {
    funds: SchemeSummary[];
    picked: string[];
    onPick: (id: string) => void;
}) {
    return (
        <ul className="space-y-0.5">
            {funds.map((scheme) => {
                const added = picked.includes(scheme.id);
                return (
                    <li key={scheme.id}>
                        <button
                            type="button"
                            disabled={added}
                            onClick={() => onPick(scheme.id)}
                            className={cn(
                                'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                added ? 'opacity-50' : 'hover:bg-muted',
                            )}
                        >
                            <AmcAvatar
                                amc={scheme.amc}
                                className="size-8 rounded-lg"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 text-sm leading-snug">
                                    {scheme.name}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {categoryName(scheme.category)}
                                </span>
                            </span>
                            {added && (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    Added
                                </span>
                            )}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
