import { createContext, useContext, useEffect } from 'react';

import type { BreadcrumbItem } from '@/types';

/** Lets a page replace its route's static breadcrumbs (e.g. with a fund's name). */
export const BreadcrumbsContext = createContext<
    ((items: BreadcrumbItem[] | null) => void) | null
>(null);

/** Use these breadcrumbs while the page is mounted. Pass a stable value (or null to keep the route's). */
export function useBreadcrumbs(items: BreadcrumbItem[] | null): void {
    const set = useContext(BreadcrumbsContext);
    const key = JSON.stringify(items);

    useEffect(() => {
        if (!set) return;
        set(JSON.parse(key) as BreadcrumbItem[] | null);
        return () => set(null);
    }, [set, key]);
}
