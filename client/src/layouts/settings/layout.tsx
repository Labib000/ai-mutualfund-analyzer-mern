import { Link, Outlet } from 'react-router';

import ProfileCard from '@/components/settings/profile-card';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';

const tabs: NavItem[] = [
    { title: 'Profile', href: '/settings/profile', icon: null },
    { title: 'Security', href: '/settings/security', icon: null },
    { title: 'Appearance', href: '/settings/appearance', icon: null },
];

export default function SettingsLayout() {
    const { isCurrentOrParentUrl } = useCurrentUrl();

    return (
        <div className="@container flex flex-1 flex-col gap-4 p-4 sm:gap-6 md:p-6">
            <header className="space-y-1">
                <h1 className="font-display text-xl font-semibold tracking-tight sm:text-3xl">
                    Settings
                </h1>
                <p className="text-sm text-muted-foreground">
                    Manage your profile, security and how Hisaab looks.
                </p>
            </header>

            <nav
                className="flex [scrollbar-width:none] gap-6 overflow-x-auto border-b"
                aria-label="Settings"
            >
                {tabs.map((tab) => {
                    const active = isCurrentOrParentUrl(tab.href);

                    return (
                        <Link
                            key={tab.href}
                            to={tab.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                                '-mb-px shrink-0 border-b-2 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:text-foreground focus-visible:underline',
                                active
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tab.title}
                        </Link>
                    );
                })}
            </nav>

            <div className="grid items-start gap-4 sm:gap-6 @4xl:grid-cols-[18rem_minmax(0,1fr)]">
                <ProfileCard />
                <div className="min-w-0 space-y-4 sm:space-y-6">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
