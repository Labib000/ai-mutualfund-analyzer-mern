import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInitials } from '@/hooks/use-initials';
import { cn } from '@/lib/utils';
import type { User } from '@/types';

export function UserInfo({
    user,
    showEmail = false,
    tone = 'default',
}: {
    user: User;
    showEmail?: boolean;
    /** "sidebar" uses the sidebar's text colours. */
    tone?: 'default' | 'sidebar';
}) {
    const getInitials = useInitials();

    return (
        <>
            <Avatar
                className={cn(
                    'h-8 w-8 overflow-hidden rounded-full',
                    tone === 'sidebar' && 'ring-1 ring-sidebar-border',
                )}
            >
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-full bg-primary/10 font-semibold text-primary">
                    {getInitials(user.name)}
                </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
                <span
                    className={cn(
                        'truncate font-medium',
                        tone === 'sidebar' && 'text-sidebar-accent-foreground',
                    )}
                >
                    {user.name}
                </span>
                {showEmail && (
                    <span
                        className={cn(
                            'truncate text-xs',
                            tone === 'sidebar'
                                ? 'text-sidebar-foreground/80'
                                : 'text-muted-foreground',
                        )}
                    >
                        {user.email}
                    </span>
                )}
            </div>
        </>
    );
}
