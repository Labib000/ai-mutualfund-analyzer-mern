import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ApiError } from '@/lib/api';

/** Loading and error placeholders for pages that fetch their data. */
export function PageLoading() {
    return (
        <div className="flex flex-1 items-center justify-center p-12">
            <Spinner className="size-6 text-muted-foreground" />
        </div>
    );
}

export function PageError({
    error,
    retry,
    backTo,
}: {
    error: unknown;
    retry?: () => void;
    backTo?: { href: string; label: string };
}) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
            <p className="font-medium">
                {notFound ? 'Not found' : "Couldn't load this page"}
            </p>
            <p className="text-sm text-muted-foreground">
                {notFound
                    ? "It doesn't exist, or it isn't yours."
                    : error instanceof ApiError
                      ? error.message
                      : 'Please check your connection and try again.'}
            </p>
            <div className="flex gap-2">
                {!notFound && retry && (
                    <Button variant="outline" onClick={retry}>
                        Try again
                    </Button>
                )}
                {backTo && (
                    <Button asChild variant="outline">
                        <Link to={backTo.href}>{backTo.label}</Link>
                    </Button>
                )}
            </div>
        </div>
    );
}
