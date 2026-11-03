import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';

export function NavMain({ items, label }: { items: NavItem[]; label: string }) {
    const { isCurrentUrl } = useCurrentUrl();

    return (
        <SidebarGroup className="px-3 py-1 group-data-[collapsible=icon]:px-2">
            <SidebarGroupLabel className="text-[0.68rem] font-semibold tracking-wider text-sidebar-foreground/60 uppercase">
                {label}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
                {items.map((item) => {
                    const active = isCurrentUrl(item.href);

                    return (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                                asChild
                                isActive={active}
                                tooltip={{ children: item.title }}
                                className="relative isolate h-9 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-transparent data-[active=true]:text-sidebar-accent-foreground"
                            >
                                <Link to={item.href}>
                                    {/* Slides between items as the page changes. */}
                                    {active && (
                                        <motion.span
                                            layoutId="nav-main-active"
                                            aria-hidden="true"
                                            className="absolute inset-0 -z-10 rounded-md bg-sidebar-accent"
                                            transition={{
                                                type: 'spring',
                                                stiffness: 500,
                                                damping: 38,
                                            }}
                                        />
                                    )}
                                    {item.icon && (
                                        <FontAwesomeIcon
                                            icon={item.icon}
                                            fixedWidth
                                            className={
                                                active
                                                    ? 'text-sidebar-primary'
                                                    : 'opacity-70'
                                            }
                                        />
                                    )}
                                    <span>{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
