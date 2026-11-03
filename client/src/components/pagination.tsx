import {
    faChevronLeft,
    faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { Button } from '@/components/ui/button';
import { type Page, pageWindow } from '@/lib/paginate';
import { cn } from '@/lib/utils';

/** "Showing 11–20 of 46" with Previous / Next and page numbers. Hidden for a single page. */
export default function Pagination({
    page,
    onPageChange,
    className,
}: {
    page: Pick<Page<unknown>, 'page' | 'pageCount' | 'from' | 'to' | 'total'>;
    onPageChange: (page: number) => void;
    className?: string;
}) {
    if (page.pageCount <= 1) return null;

    const current = page.page;

    return (
        <nav
            aria-label="Pagination"
            className={cn('flex items-center justify-between gap-3', className)}
        >
            <p className="hidden text-sm text-muted-foreground tabular-nums sm:block">
                Showing {page.from}–{page.to} of {page.total}
            </p>

            <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-end">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(current - 1)}
                    disabled={current === 1}
                    aria-label="Previous page"
                >
                    <FontAwesomeIcon icon={faChevronLeft} className="size-3" />
                    <span className="hidden md:inline">Previous</span>
                </Button>

                <span className="text-sm text-muted-foreground tabular-nums sm:hidden">
                    Page {current} of {page.pageCount}
                </span>

                <ul className="hidden items-center gap-1 sm:flex">
                    {pageWindow(current, page.pageCount).map((p, i) =>
                        p === 'gap' ? (
                            <li
                                key={`gap-${i}`}
                                aria-hidden="true"
                                className="w-6 text-center text-muted-foreground"
                            >
                                …
                            </li>
                        ) : (
                            <li key={p}>
                                <Button
                                    variant={
                                        p === current ? 'secondary' : 'ghost'
                                    }
                                    size="sm"
                                    onClick={() => onPageChange(p)}
                                    aria-current={
                                        p === current ? 'page' : undefined
                                    }
                                    aria-label={`Page ${p}`}
                                    className={cn(
                                        'min-w-8 px-2 tabular-nums',
                                        p === current && 'font-semibold',
                                    )}
                                >
                                    {p}
                                </Button>
                            </li>
                        ),
                    )}
                </ul>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(current + 1)}
                    disabled={current === page.pageCount}
                    aria-label="Next page"
                >
                    <span className="hidden md:inline">Next</span>
                    <FontAwesomeIcon icon={faChevronRight} className="size-3" />
                </Button>
            </div>
        </nav>
    );
}
