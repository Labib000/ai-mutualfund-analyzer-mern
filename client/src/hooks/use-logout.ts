import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { ME_KEY } from '@/hooks/use-user';
import { api } from '@/lib/api';

/** Logs out, drops all cached data and goes to the welcome page. */
export function useLogout() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    return useCallback(async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        queryClient.clear();
        queryClient.setQueryData(ME_KEY, { user: null, passwordRules: '' });
        await queryClient.invalidateQueries({ queryKey: ME_KEY });
        await navigate('/');
    }, [navigate, queryClient]);
}
