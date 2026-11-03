import { useLocation } from 'react-router';

export type UseCurrentUrlReturn = {
    currentUrl: string;
    isCurrentUrl: (url: string) => boolean;
    isCurrentOrParentUrl: (url: string) => boolean;
};

/** Port of the Inertia hook, on top of React Router's location. */
export function useCurrentUrl(): UseCurrentUrlReturn {
    const { pathname } = useLocation();

    return {
        currentUrl: pathname,
        isCurrentUrl: (url) =>
            new URL(url, window.location.origin).pathname === pathname,
        isCurrentOrParentUrl: (url) =>
            pathname.startsWith(new URL(url, window.location.origin).pathname),
    };
}
