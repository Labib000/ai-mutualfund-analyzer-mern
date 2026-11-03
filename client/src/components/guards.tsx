import { Navigate, Outlet, useLocation } from 'react-router';

import { Spinner } from '@/components/ui/spinner';
import { useMe } from '@/hooks/use-user';

function FullPageSpinner() {
    return (
        <div className="flex min-h-svh items-center justify-center text-muted-foreground">
            <Spinner className="size-6" />
        </div>
    );
}

/** Guests only (login, register, password reset). Signed-in users go to the dashboard. */
export function RequireGuest() {
    const { data, isPending } = useMe();

    if (isPending) return <FullPageSpinner />;
    if (data?.user) return <Navigate to="/dashboard" replace />;

    return <Outlet />;
}

/** Signed-in users only; guests go to /login and come back afterwards. */
export function RequireAuth() {
    const { data, isPending } = useMe();
    const location = useLocation();

    if (isPending) return <FullPageSpinner />;

    if (!data?.user) {
        const next = encodeURIComponent(
            `${location.pathname}${location.search}`,
        );
        return <Navigate to={`/login?next=${next}`} replace />;
    }

    return <Outlet />;
}

/** Like Laravel's `verified` middleware: unverified users see the verify prompt. */
export function RequireVerified() {
    const { data } = useMe();

    if (!data?.user?.emailVerifiedAt) {
        return <Navigate to="/verify-email" replace />;
    }

    return <Outlet />;
}

/** The verify prompt is only for unverified users. */
export function RequireUnverified() {
    const { data } = useMe();

    if (data?.user?.emailVerifiedAt) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
}
