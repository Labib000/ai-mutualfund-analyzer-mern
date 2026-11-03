import AppearanceDropdown from '@/components/appearance-dropdown';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    // Solid on phones: backdrop blur is costly while scrolling on mobile GPUs.
    return (
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 md:h-14 md:bg-background/90 md:px-6 md:backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger className="-ml-1 size-10 md:size-7" />
                <Separator
                    orientation="vertical"
                    className="mr-1 data-[orientation=vertical]:h-4"
                />
                <div className="min-w-0 truncate">
                    <Breadcrumbs breadcrumbs={breadcrumbs} />
                </div>
            </div>
            <AppearanceDropdown />
        </header>
    );
}
