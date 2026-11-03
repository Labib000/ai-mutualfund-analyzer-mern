export type Page<T> = {
    items: T[];
    /** 1-based, clamped to 1…pageCount. */
    page: number;
    pageCount: number;
    /** 1-based position of the first and last item shown; 0 when empty. */
    from: number;
    to: number;
    total: number;
};

/** One page of `items`. Out-of-range pages snap to the nearest real one. */
export function paginate<T>(
    items: readonly T[],
    page: number,
    perPage: number,
): Page<T> {
    const total = items.length;
    const pageCount = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(
        pageCount,
        Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1),
    );
    const start = (current - 1) * perPage;
    const slice = items.slice(start, start + perPage);

    return {
        items: slice,
        page: current,
        pageCount,
        from: total === 0 ? 0 : start + 1,
        to: start + slice.length,
        total,
    };
}

/**
 * Page numbers to show, with 'gap' for ellipses: always the first and last
 * page and one either side of the current one, e.g. [1, 'gap', 4, 5, 6, 'gap', 12].
 */
export function pageWindow(
    page: number,
    pageCount: number,
): (number | 'gap')[] {
    if (pageCount <= 7)
        return Array.from({ length: pageCount }, (_, i) => i + 1);

    // Near an end, show five in a row so the window keeps its width.
    let start = Math.max(2, page - 1);
    let end = Math.min(pageCount - 1, page + 1);
    if (page <= 3) {
        start = 2;
        end = 5;
    } else if (page >= pageCount - 2) {
        start = pageCount - 4;
        end = pageCount - 1;
    }

    const pages: (number | 'gap')[] = [1];
    if (start > 2) pages.push('gap');
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < pageCount - 1) pages.push('gap');
    pages.push(pageCount);
    return pages;
}
