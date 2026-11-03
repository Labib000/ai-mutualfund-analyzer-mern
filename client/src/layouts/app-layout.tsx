import { useState } from 'react';
import { Outlet, useMatches } from 'react-router';

import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { BreadcrumbsContext } from '@/hooks/use-breadcrumbs';
import type { BreadcrumbItem, RouteHandle } from '@/types';

/** Port of layouts/app/app-sidebar-layout; breadcrumbs come from route handles. */
export default function AppLayout() {
    const matches = useMatches();
    const [override, setOverride] = useState<BreadcrumbItem[] | null>(null);
    const breadcrumbs: BreadcrumbItem[] =
        override ??
        [...matches]
            .reverse()
            .map((m) => (m.handle as RouteHandle | undefined)?.breadcrumbs)
            .find(Boolean) ??
        [];

    return (
        <BreadcrumbsContext.Provider value={setOverride}>
            <AppShell variant="sidebar">
                <AppSidebar />
                <AppContent
                    variant="sidebar"
                    className="min-w-0 overflow-x-clip"
                >
                    <AppSidebarHeader breadcrumbs={breadcrumbs} />
                    <Outlet />
                </AppContent>
            </AppShell>
        </BreadcrumbsContext.Provider>
    );
}
