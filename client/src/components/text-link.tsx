import type { ComponentProps } from 'react';
import { Link } from 'react-router';

import { cn } from '@/lib/utils';

export const textLinkClass =
    'text-foreground underline decoration-neutral-300 underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current! dark:decoration-neutral-500';

export default function TextLink({
    className = '',
    children,
    ...props
}: ComponentProps<typeof Link>) {
    return (
        <Link className={cn(textLinkClass, className)} {...props}>
            {children}
        </Link>
    );
}
