import type {
    DashboardResponse,
    HoldingDetailResponse,
    HoldingListResponse,
    MessageResponse,
    SchemeSearchResponse,
} from '@hisaab/shared';
import {
    keepPreviousData,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';

export const HOLDINGS_KEY = ['holdings'] as const;

export function useHoldings() {
    return useQuery({
        queryKey: HOLDINGS_KEY,
        queryFn: () => api<HoldingListResponse>('/holdings'),
    });
}

export const DASHBOARD_KEY = ['dashboard'] as const;

export function useDashboard() {
    return useQuery({
        queryKey: DASHBOARD_KEY,
        queryFn: () => api<DashboardResponse>('/dashboard'),
    });
}

export function useHolding(id: string) {
    return useQuery({
        queryKey: [...HOLDINGS_KEY, id],
        queryFn: () => api<HoldingDetailResponse>(`/holdings/${id}`),
    });
}

/** Scheme search; only runs from 2 characters. Pass an already-debounced query. */
export function useSchemeSearch(query: string) {
    const q = query.trim();

    return useQuery({
        queryKey: ['schemes', q],
        queryFn: () =>
            api<SchemeSearchResponse>(`/schemes?${new URLSearchParams({ q })}`),
        enabled: q.length >= 2,
        placeholderData: keepPreviousData,
        staleTime: 60_000,
    });
}

/**
 * After a portfolio write: show the server's message as a toast and refetch
 * the dashboard, holdings list and pages (and the search's "In portfolio" badges).
 */
export function usePortfolioChanged() {
    const queryClient = useQueryClient();

    return useCallback(
        async (data?: MessageResponse) => {
            if (data?.message) {
                if (data.warning) toast.warning(data.message);
                else toast.success(data.message);
            }
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: HOLDINGS_KEY }),
                queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY }),
                queryClient.invalidateQueries({ queryKey: ['schemes'] }),
            ]);
        },
        [queryClient],
    );
}
