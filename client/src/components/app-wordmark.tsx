import { cn } from '@/lib/utils';

/**
 * The full Hisaab logo: dark lettering in light mode, white in dark mode.
 */
export default function AppWordmark({ className }: { className?: string }) {
    return (
        <>
            <img
                src="/webAssets/hisaab-logo.svg"
                alt="Hisaab"
                className={cn('h-9 w-auto dark:hidden', className)}
            />
            <img
                src="/webAssets/hisaab-logo-light.svg"
                alt="Hisaab"
                className={cn('hidden h-9 w-auto dark:block', className)}
            />
        </>
    );
}
