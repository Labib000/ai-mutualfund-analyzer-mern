import type { ComponentType } from 'react';
import { Navigate, type RouteObject, createBrowserRouter } from 'react-router';

import {
    RequireAuth,
    RequireGuest,
    RequireUnverified,
    RequireVerified,
} from '@/components/guards';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';
import SettingsLayout from '@/layouts/settings/layout';
import NotFound from '@/pages/not-found';
import type { RouteHandle } from '@/types';

/** Code-split page: loaded the first time its route matches. */
const page =
    (load: () => Promise<{ default: ComponentType }>) =>
    async (): Promise<{ Component: ComponentType }> => ({
        Component: (await load()).default,
    });

const handle = (h: RouteHandle) => h;

const routes: RouteObject[] = [
    { path: '/', lazy: page(() => import('@/pages/welcome')) },

    // Guests: login, register, password reset.
    {
        element: <RequireGuest />,
        children: [
            {
                element: <AuthLayout />,
                children: [
                    {
                        path: 'login',
                        handle: handle({
                            heading: 'Log in to your account',
                            description:
                                'Enter your email and password below to log in',
                        }),
                        lazy: page(() => import('@/pages/auth/login')),
                    },
                    {
                        path: 'register',
                        handle: handle({
                            heading: 'Create an account',
                            description:
                                'Enter your details below to create your account',
                        }),
                        lazy: page(() => import('@/pages/auth/register')),
                    },
                    {
                        path: 'forgot-password',
                        handle: handle({
                            heading: 'Forgot password',
                            description:
                                'Enter your email to receive a password reset link',
                        }),
                        lazy: page(
                            () => import('@/pages/auth/forgot-password'),
                        ),
                    },
                    {
                        path: 'reset-password/:token',
                        handle: handle({
                            heading: 'Reset password',
                            description: 'Please enter your new password below',
                        }),
                        lazy: page(() => import('@/pages/auth/reset-password')),
                    },
                ],
            },
        ],
    },

    // Signed in.
    {
        element: <RequireAuth />,
        children: [
            {
                element: <RequireUnverified />,
                children: [
                    {
                        element: <AuthLayout />,
                        children: [
                            {
                                path: 'verify-email',
                                handle: handle({
                                    heading: 'Email verification',
                                    description:
                                        'Please verify your email address by clicking on the link we just emailed to you.',
                                }),
                                lazy: page(
                                    () => import('@/pages/auth/verify-email'),
                                ),
                            },
                        ],
                    },
                ],
            },
            {
                element: <AppLayout />,
                children: [
                    {
                        path: 'settings',
                        element: <SettingsLayout />,
                        children: [
                            {
                                index: true,
                                element: (
                                    <Navigate to="/settings/profile" replace />
                                ),
                            },
                            {
                                path: 'profile',
                                handle: handle({
                                    breadcrumbs: [
                                        {
                                            title: 'Profile settings',
                                            href: '/settings/profile',
                                        },
                                    ],
                                }),
                                lazy: page(
                                    () => import('@/pages/settings/profile'),
                                ),
                            },
                            {
                                element: <RequireVerified />,
                                children: [
                                    {
                                        path: 'security',
                                        handle: handle({
                                            breadcrumbs: [
                                                {
                                                    title: 'Security settings',
                                                    href: '/settings/security',
                                                },
                                            ],
                                        }),
                                        lazy: page(
                                            () =>
                                                import('@/pages/settings/security'),
                                        ),
                                    },
                                    {
                                        path: 'appearance',
                                        handle: handle({
                                            breadcrumbs: [
                                                {
                                                    title: 'Appearance settings',
                                                    href: '/settings/appearance',
                                                },
                                            ],
                                        }),
                                        lazy: page(
                                            () =>
                                                import('@/pages/settings/appearance'),
                                        ),
                                    },
                                ],
                            },
                        ],
                    },

                    // Verified only (Laravel's `verified` middleware).
                    {
                        element: <RequireVerified />,
                        children: [
                            {
                                path: 'dashboard',
                                handle: handle({
                                    breadcrumbs: [
                                        {
                                            title: 'Dashboard',
                                            href: '/dashboard',
                                        },
                                    ],
                                }),
                                lazy: page(() => import('@/pages/dashboard')),
                            },
                            {
                                path: 'holdings',
                                handle: handle({
                                    breadcrumbs: [
                                        {
                                            title: 'Portfolio',
                                            href: '/holdings',
                                        },
                                    ],
                                }),
                                lazy: page(
                                    () => import('@/pages/holdings/index'),
                                ),
                            },
                            {
                                path: 'holdings/create',
                                handle: handle({
                                    breadcrumbs: [
                                        {
                                            title: 'Portfolio',
                                            href: '/holdings',
                                        },
                                        {
                                            title: 'Add fund',
                                            href: '/holdings/create',
                                        },
                                    ],
                                }),
                                lazy: page(
                                    () => import('@/pages/holdings/create'),
                                ),
                            },
                            {
                                path: 'ask',
                                handle: handle({
                                    breadcrumbs: [
                                        { title: 'Ask AI', href: '/ask' },
                                    ],
                                }),
                                lazy: page(() => import('@/pages/ask')),
                            },
                        ],
                    },
                ],
            },
        ],
    },

    { path: '*', element: <NotFound /> },
];

export const router = createBrowserRouter(routes);
