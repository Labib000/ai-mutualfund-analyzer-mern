import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { User as ApiUser } from '@hisaab/shared';
import type { ReactNode } from 'react';

export type User = ApiUser & { avatar?: string };

export type BreadcrumbItem = {
    title: string;
    href: string;
};

export type NavItem = {
    title: string;
    href: string;
    icon?: IconDefinition | null;
    isActive?: boolean;
};

export type AppVariant = 'header' | 'sidebar';

export type AuthLayoutProps = {
    children?: ReactNode;
    title?: string;
    description?: string;
};

/** Per-route metadata, read by the layouts through useMatches(). */
export type RouteHandle = {
    /** Auth layout heading and description. */
    heading?: string;
    description?: string;
    /** App layout breadcrumbs. */
    breadcrumbs?: BreadcrumbItem[];
};
