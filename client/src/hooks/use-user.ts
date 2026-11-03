import type { MeResponse } from '@hisaab/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api } from '@/lib/api';
import type { User } from '@/types';

export const ME_KEY = ['me'] as const;

/** The session: current user (or null) and the password rules string. */
export function useMe() {
    return useQuery({
        queryKey: ME_KEY,
        queryFn: () => api<MeResponse>('/auth/me'),
        staleTime: 60_000,
        refetchOnWindowFocus: true,
    });
}

/** The signed-in user. Only use under <RequireAuth>, where it is loaded. */
export function useUser(): User {
    const { data } = useMe();

    if (!data?.user) {
        throw new Error('useUser() used outside <RequireAuth>');
    }

    return data.user;
}

/** Replaces the cached user after login, register or a profile change. */
export function useSetUser() {
    const queryClient = useQueryClient();

    return useCallback(
        (user: User | null) => {
            queryClient.setQueryData<MeResponse>(ME_KEY, (old) => ({
                passwordRules: old?.passwordRules ?? '',
                user,
            }));
        },
        [queryClient],
    );
}
