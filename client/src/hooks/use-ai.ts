import type { AiErrorBody, AiRemaining } from '@hisaab/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiError, api } from '@/lib/api';

/** Requests left this month, shared by every AI card on every page. */
export const AI_REMAINING_KEY = ['ai', 'remaining'] as const;

/** The last known number of AI requests left; null until an AI endpoint has answered. */
export function useAiRemaining(): number | null {
    const { data } = useQuery<number | null>({
        queryKey: AI_REMAINING_KEY,
        queryFn: () => null,
        enabled: false,
        staleTime: Infinity,
    });
    return data ?? null;
}

const FALLBACK = 'Something went wrong. Please try again.';

/**
 * Calls an AI endpoint, tracking loading, the latest answer and errors (port
 * of Laravel's useAiRequest). Every answer, errors included, updates the
 * shared "requests left" count.
 */
export function useAiRequest<T extends AiRemaining & { text: string }>() {
    const queryClient = useQueryClient();
    const [result, setResult] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function run(path: string, body: unknown = {}): Promise<T | null> {
        setLoading(true);
        setError(null);
        try {
            const data = await api<T>(path, { method: 'POST', body });
            queryClient.setQueryData(AI_REMAINING_KEY, data.remaining);
            setResult(data);
            return data;
        } catch (e) {
            const remaining =
                e instanceof ApiError
                    ? (e.body as Partial<AiErrorBody> | null)?.remaining
                    : undefined;
            if (typeof remaining === 'number')
                queryClient.setQueryData(AI_REMAINING_KEY, remaining);
            setError(e instanceof ApiError ? e.message : FALLBACK);
            return null;
        } finally {
            setLoading(false);
        }
    }

    return { run, result, error, loading };
}
