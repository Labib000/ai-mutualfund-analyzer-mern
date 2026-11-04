import {
    faCalculator,
    faChartPie,
    faComments,
    faPlus,
    faScaleBalanced,
    faWallet,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link } from 'react-router';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Button } from '@/components/ui/button';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import type { NavItem } from '@/types';

const overviewItems: NavItem[] = [
    {
        title: 'Dashboard',
        href: '/dashboard',
        icon: faChartPie,
    },
    {
        title: 'Portfolio',
        href: '/holdings',
        icon: faWallet,
    },
];

const insightItems: NavItem[] = [
    {
        title: 'Ask AI',
        href: '/ask',
        icon: faComments,
    },
];

const toolItems: NavItem[] = [
    {
        title: 'SIP calculator',
        href: '/tools/sip-calculator',
        icon: faCalculator,
    },
    {
        title: 'Compare funds',
        href: '/tools/compare',
        icon: faScaleBalanced,
    },
];

export function AppSidebar() {
    const { isMobile, setOpenMobile } = useSidebar();

    return (
        <Sidebar collapsible="icon" variant="sidebar">
            <SidebarHeader className="h-16 flex-row items-center justify-between border-b border-sidebar-border px-4 py-0 group-data-[collapsible=icon]:px-2 md:h-14 md:px-3">
                <SidebarMenu className="min-w-0">
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            size="lg"
                            asChild
                            className="h-10 hover:bg-transparent active:bg-transparent"
                        >
                            <Link to="/dashboard">
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
                {isMobile && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 shrink-0 text-sidebar-foreground"
                        onClick={() => setOpenMobile(false)}
                        aria-label="Close menu"
                    >
                        <FontAwesomeIcon icon={faXmark} className="size-4" />
                    </Button>
                )}
            </SidebarHeader>

            <SidebarContent className="gap-1 pt-3">
                <NavMain label="Overview" items={overviewItems} />
                <NavMain label="Insights" items={insightItems} />
                <NavMain label="Tools" items={toolItems} />

                <SidebarGroup className="px-3 pt-4">
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                asChild
                                tooltip={{ children: 'Add fund' }}
                                className="h-9 justify-center bg-sidebar-primary font-medium text-sidebar-primary-foreground shadow-xs hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground active:bg-sidebar-primary active:text-sidebar-primary-foreground"
                            >
                                <Link to="/holdings/create">
                                    <FontAwesomeIcon icon={faPlus} />
                                    <span>Add fund</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-2">
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
