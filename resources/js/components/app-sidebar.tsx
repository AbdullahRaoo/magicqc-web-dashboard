import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { dashboard } from '@/routes';
import operatorRoutes from '@/routes/operators';
import brandRoutes from '@/routes/brands';
import purchaseOrderRoutes from '@/routes/purchase-orders';
import annotationUploadRoutes from '@/routes/annotation-upload';
import { type NavItem, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { LayoutGrid, Users, Tag, ShoppingCart, Upload, Code2, BarChart3, Shield, Settings } from 'lucide-react';
import AppLogo from './app-logo';

// Base navigation items (available to all standard users)
const baseNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        href: dashboard(),
        icon: LayoutGrid,
    },
    {
        title: 'Operators',
        href: operatorRoutes.index(),
        icon: Users,
    },
    {
        title: 'Brands',
        href: brandRoutes.index(),
        icon: Tag,
    },
    {
        title: 'Purchase Orders',
        href: purchaseOrderRoutes.index(),
        icon: ShoppingCart,
    },
];

// Developer-only navigation item
const developerNavItem: NavItem = {
    title: 'Annotation Upload',
    href: annotationUploadRoutes.index(),
    icon: Upload,
};

// MEB Director analytics navigation
const mebNavItems: NavItem[] = [
    {
        title: 'Analytics Dashboard',
        href: '/analytics-dashboard',
        icon: BarChart3,
    },
];

const footerNavItems: NavItem[] = [];

export function AppSidebar() {
    const { isDeveloper, authRole } = usePage<SharedData>().props;

    // Build navigation items based on user role
    let mainNavItems: NavItem[];

    if (authRole === 'meb') {
        // MEB user gets only the analytics dashboard
        mainNavItems = [...mebNavItems];
    } else {
        // Standard users (ManagerQC, developer, regular auth)
        mainNavItems = [...baseNavItems];
        if (isDeveloper) {
            mainNavItems.push(developerNavItem);
        }
    }

    // Determine home link based on role
    const homeLink = authRole === 'meb' ? '/analytics-dashboard' : dashboard();

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={homeLink} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                {isDeveloper && (
                    <div className="px-3 py-2">
                        <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#264c59]/10 to-transparent px-3 py-2 text-xs text-[#264c59]">
                            <Code2 className="h-3 w-3" />
                            <span className="font-medium">Developer Mode</span>
                        </div>
                    </div>
                )}
                {authRole === 'manager_qc' && (
                    <div className="px-3 py-2">
                        <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#264c59]/10 to-transparent px-3 py-2 text-xs text-[#264c59]">
                            <Shield className="h-3 w-3" />
                            <span className="font-medium">QC Manager</span>
                        </div>
                    </div>
                )}
                {authRole === 'meb' && (
                    <div className="px-3 py-2">
                        <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#f7a536]/10 to-transparent px-3 py-2 text-xs text-[#f7a536]">
                            <BarChart3 className="h-3 w-3" />
                            <span className="font-medium">Director Access</span>
                        </div>
                    </div>
                )}
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
