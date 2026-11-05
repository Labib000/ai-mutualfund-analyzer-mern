import type { ReactNode } from 'react';

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * A settings panel: heading, then the fields, then a footer bar holding the
 * action. A short panel with no fields puts its `action` beside the heading.
 */
export function SettingsCard({
    title,
    description,
    action,
    danger = false,
    children,
}: {
    title: string;
    description: ReactNode;
    action?: ReactNode;
    danger?: boolean;
    children?: ReactNode;
}) {
    return (
        <Card
            className={cn(
                '@container gap-0 overflow-hidden py-0 sm:gap-0 sm:py-0',
                danger && 'border-destructive/30',
            )}
        >
            <CardHeader
                className={cn(
                    'flex flex-col gap-3 py-4 sm:py-5 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-6',
                    children !== undefined && 'border-b',
                )}
            >
                <div className="min-w-0 space-y-1.5">
                    <CardTitle className={cn(danger && 'text-destructive')}>
                        {title}
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                {action}
            </CardHeader>
            {children}
        </Card>
    );
}

export function SettingsCardBody({
    className,
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    return (
        <CardContent className={cn('py-5 sm:py-6', className)}>
            {children}
        </CardContent>
    );
}

export function SettingsCardFooter({ children }: { children: ReactNode }) {
    return (
        <CardFooter className="justify-end gap-3 border-t bg-muted/40 py-3 sm:py-4">
            {children}
        </CardFooter>
    );
}
