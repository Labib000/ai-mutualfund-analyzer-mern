import { Link, Outlet, useMatches } from 'react-router';

import AppWordmark from '@/components/app-wordmark';
import type { RouteHandle } from '@/types';

/**
 * Port of layouts/auth/auth-simple-layout: logo, heading, description and a
 * card. The heading and description come from the route's handle.
 */
export default function AuthLayout() {
    const matches = useMatches();
    const handle = (matches.at(-1)?.handle ?? {}) as RouteHandle;

    return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
            <div className="w-full max-w-sm">
                <div className="flex flex-col gap-8">
                    <div className="flex flex-col items-center gap-6">
                        <Link to="/" aria-label="Hisaab home">
                            <AppWordmark className="h-10" />
                        </Link>

                        <div className="space-y-2 text-center">
                            <h1 className="text-2xl font-semibold tracking-tight">
                                {handle.heading}
                            </h1>
                            <p className="text-center text-sm text-muted-foreground">
                                {handle.description}
                            </p>
                        </div>
                    </div>
                    <div className="rounded-lg border bg-card p-6 shadow-sm sm:p-8">
                        <Outlet />
                    </div>
                </div>
            </div>
        </div>
    );
}
