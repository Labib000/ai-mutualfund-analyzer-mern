import AppLogoIcon from '@/components/app-logo-icon';
import { cn } from '@/lib/utils';

/**
 * Mark plus app name. Uses the sidebar's strong text colour by default.
 */
export default function AppLogo({
    textClassName = 'text-sidebar-accent-foreground',
}: {
    textClassName?: string;
}) {
    return (
        <>
            {/* Wrapped so the sidebar button's [&>svg]:size-4 rule doesn't shrink the mark. */}
            <span className="flex size-8 shrink-0">
                <AppLogoIcon className="size-8" />
            </span>
            <span
                className={cn(
                    'ml-1 truncate font-display text-lg leading-none font-semibold tracking-tight group-data-[collapsible=icon]:hidden',
                    textClassName,
                )}
            >
                Hisaab
            </span>
        </>
    );
}
