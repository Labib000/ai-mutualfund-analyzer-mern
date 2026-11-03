import './app.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import { ME_KEY } from '@/hooks/use-user';
import { setUnauthenticatedHandler } from '@/lib/api';
import { router } from '@/routes';

initializeTheme();

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

// A 401 anywhere means the session is gone: re-check who we are, and the
// route guards send the user to /login.
setUnauthenticatedHandler(() => {
    void queryClient.invalidateQueries({ queryKey: ME_KEY });
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={0}>
                <RouterProvider router={router} />
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    </StrictMode>,
);
