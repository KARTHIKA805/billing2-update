import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import SuvaiLogo from '../suvai.jpeg';
import { ViewState, UserRole, City, Branch } from '../types';
import {
    LayoutDashboard,
    Receipt,
    Package,
    LogOut,
    Bell,
    Users,
    UserPlus,
    Menu,
    X,
    History,
    PanelLeftClose,
    PanelLeftOpen,
    MapPin
} from 'lucide-react';
import { Tag } from 'lucide-react';
import { ROLE_LABELS, canAccessBilling, canEditCategories, canManageLocations, canManageUsers, canSwitchLocation } from '../utils/access';

interface LayoutProps {
    currentView: ViewState;
    onChangeView: (view: ViewState) => void;
    onLogout: () => void;
    children: React.ReactNode;
    notifications: { id: string, message: string }[];
    userRole: UserRole;
    fillViewport?: boolean;
    locationLabel?: string;
    cities?: City[];
    branches?: Branch[];
    selectedCityId?: string | null;
    selectedBranchId?: string | null;
    onChangeLocation?: () => void;
    onSelectWorkspaceBranch?: (branchId: string | null) => void;
}

const Layout: React.FC<LayoutProps> = ({
    currentView,
    onChangeView,
    onLogout,
    children,
    notifications,
    userRole,
    fillViewport = false,
    locationLabel,
    cities = [],
    branches = [],
    selectedCityId,
    selectedBranchId,
    onChangeLocation,
    onSelectWorkspaceBranch,
}) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);
    const toggleMobileMenu = useCallback(() => {
        setShowNotifications(false);
        setIsMobileMenuOpen((open) => !open);
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem('suvai-sidebar-collapsed');
        if (stored === 'true') setIsSidebarCollapsed(true);
    }, []);

    useLayoutEffect(() => {
        document.body.classList.toggle('mobile-menu-open', isMobileMenuOpen);
        return () => document.body.classList.remove('mobile-menu-open');
    }, [isMobileMenuOpen]);

    useEffect(() => {
        if (!isMobileMenuOpen) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeMobileMenu();
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isMobileMenuOpen, closeMobileMenu]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 768px)');
        const handleViewportChange = () => {
            if (mediaQuery.matches) closeMobileMenu();
        };

        mediaQuery.addEventListener('change', handleViewportChange);
        return () => mediaQuery.removeEventListener('change', handleViewportChange);
    }, [closeMobileMenu]);

    const toggleDesktopSidebar = () => {
        setIsSidebarCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('suvai-sidebar-collapsed', String(next));
            return next;
        });
    };

    const navItems = [
        { view: ViewState.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
        ...(canAccessBilling(userRole)
            ? [{ view: ViewState.BILLING, icon: Receipt, label: 'Billing' as const }]
            : []),
        { view: ViewState.BILLS, icon: History, label: 'Bills History' },
        { view: ViewState.INVENTORY, icon: Package, label: 'Inventory' },
        ...(canEditCategories(userRole)
            ? [{ view: ViewState.CATEGORIES, icon: Tag, label: 'Categories' as const }]
            : []),
        { view: ViewState.CUSTOMERS, icon: Users, label: 'Customers' },
        ...(canManageLocations(userRole)
            ? [{ view: ViewState.LOCATIONS, icon: MapPin, label: 'Locations' as const }]
            : []),
        ...(canManageUsers(userRole)
            ? [{ view: ViewState.USERS, icon: UserPlus, label: 'Users' as const }]
            : []),
    ];

    const handleNavigate = (view: ViewState) => {
        onChangeView(view);
        closeMobileMenu();
        setShowNotifications(false);
    };

    const NavItem = ({
        view,
        icon: Icon,
        label,
        collapsed = false,
        mobile = false,
    }: {
        view: ViewState;
        icon: React.ComponentType<{ size?: number; className?: string }>;
        label: string;
        collapsed?: boolean;
        mobile?: boolean;
    }) => {
        const isActive = currentView === view;

        if (mobile) {
            return (
                <button
                    type="button"
                    onClick={() => handleNavigate(view)}
                    aria-label={label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`mobile-nav-item ${isActive ? 'mobile-nav-item--active' : ''}`}
                >
                    <Icon size={20} className="shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={() => handleNavigate(view)}
                title={collapsed ? label : undefined}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center w-full rounded-2xl text-left transition-colors duration-150 ease-out group ${
                    collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-4 py-3'
                } ${
                    isActive
                        ? 'bg-[var(--brand-surface)] text-[var(--brand-dark)]'
                        : 'bg-[var(--brand-dark)] text-[var(--brand-text-light)] hover:bg-[var(--brand-surface)] hover:text-[var(--brand-dark)]'
                }`}
            >
                <Icon
                    size={20}
                    className={`shrink-0 ${
                        isActive
                            ? 'text-[var(--brand-dark)]'
                            : 'text-[var(--brand-text-light)] group-hover:text-[var(--brand-dark)]'
                    }`}
                />
                {!collapsed && <span className="flex-1 truncate">{label}</span>}
            </button>
        );
    };

    const pageTitle =
        currentView === ViewState.DASHBOARD ? 'Dashboard'
        : currentView === ViewState.BILLING ? 'Billing'
        : currentView === ViewState.BILLS ? 'Bills History'
        : currentView === ViewState.INVENTORY ? 'Inventory'
        : currentView === ViewState.CATEGORIES ? 'Categories'
        : currentView === ViewState.CUSTOMERS ? 'Customers'
        : currentView === ViewState.USERS ? 'Users'
        : currentView === ViewState.LOCATIONS ? 'Locations'
        : 'Suvai';

    return (
        <div className="app-shell flex bg-[var(--brand-muted)]">
            {/* Laptop / Desktop Sidebar */}
            <aside
                className={`hidden md:flex flex-col h-full bg-[var(--brand-dark)] border-r border-[var(--brand-border)] shadow-sm z-30 transition-[width] duration-200 ease-out overflow-hidden ${
                    isSidebarCollapsed ? 'w-[4.5rem]' : 'w-64'
                }`}
            >
                <div className={`border-b border-[var(--brand-border)] ${isSidebarCollapsed ? 'p-3 flex justify-center' : 'p-6'}`}>
                    <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                        <img src={SuvaiLogo} alt="Suvai" className="w-10 h-10 object-contain rounded-md shrink-0" />
                        {!isSidebarCollapsed && (
                            <div className="min-w-0">
                                <h1 className="font-bold text-lg text-[var(--brand-text-light)] tracking-tight">Suvai</h1>
                                <p className="text-xs text-[var(--brand-accent)] font-medium truncate">
                                    {ROLE_LABELS[userRole]}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <nav className={`flex-1 space-y-2 overflow-y-auto overflow-x-hidden ${isSidebarCollapsed ? 'p-2' : 'p-4'}`}>
                    {navItems.map((item) => (
                        <NavItem
                            key={item.view}
                            collapsed={isSidebarCollapsed}
                            view={item.view}
                            icon={item.icon}
                            label={item.label}
                        />
                    ))}
                </nav>
            </aside>

            {/* Mobile Menu Overlay */}
            <div
                className={`mobile-nav-overlay md:hidden ${isMobileMenuOpen ? 'mobile-nav-overlay--open' : ''}`}
                onClick={closeMobileMenu}
                aria-hidden={!isMobileMenuOpen}
            />

            {/* Mobile Sidebar */}
            <aside
                id="mobile-nav-drawer"
                className={`mobile-nav-drawer md:hidden ${isMobileMenuOpen ? 'mobile-nav-drawer--open' : ''}`}
                aria-hidden={!isMobileMenuOpen}
            >
                <div className="p-4 border-b border-[var(--brand-border)] flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <img src={SuvaiLogo} alt="Suvai" className="w-10 h-10 object-contain rounded-md shrink-0" />
                        <div className="min-w-0">
                            <h1 className="font-bold text-lg text-[var(--brand-text-light)] tracking-tight">Suvai</h1>
                            <p className="text-xs text-[var(--brand-accent)] font-medium truncate">
                                {ROLE_LABELS[userRole]}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={closeMobileMenu}
                        className="mobile-menu-button text-[var(--brand-text-light)]"
                        aria-label="Close menu"
                    >
                        <X size={22} />
                    </button>
                </div>

                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavItem
                            key={item.view}
                            mobile
                            view={item.view}
                            icon={item.icon}
                            label={item.label}
                        />
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative w-full min-w-0">
                <header className="h-14 sm:h-16 bg-[var(--brand-surface)] md:bg-[var(--brand-surface)]/90 md:backdrop-blur-md border-b border-[var(--brand-border)] flex items-center justify-between px-3 sm:px-4 md:px-8 sticky top-0 z-20">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <button
                            type="button"
                            className="mobile-menu-button md:hidden"
                            onClick={toggleMobileMenu}
                            aria-expanded={isMobileMenuOpen}
                            aria-controls="mobile-nav-drawer"
                            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                        >
                            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                        <button
                            type="button"
                            className="hidden md:inline-flex items-center justify-center text-[var(--brand-dark)] p-1.5 rounded-lg hover:bg-[var(--brand-muted)] transition-colors"
                            onClick={toggleDesktopSidebar}
                            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {isSidebarCollapsed ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}
                        </button>
                        <h2 className="text-base sm:text-lg md:text-xl font-semibold text-[var(--brand-dark)] truncate">
                            {pageTitle}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                        {onSelectWorkspaceBranch && branches.length > 0 ? (
                            <label className="inline-flex items-center gap-1.5 max-w-[9rem] xs:max-w-[12rem] sm:max-w-[16rem] px-2 sm:px-3 py-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-muted)] text-xs font-medium text-[var(--brand-dark)]">
                                <MapPin size={14} className="shrink-0" />
                                <select
                                    value={selectedBranchId || 'all'}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        onSelectWorkspaceBranch(value === 'all' ? null : value);
                                    }}
                                    className="bg-transparent text-[var(--brand-dark)] font-medium truncate outline-none max-w-[7rem] sm:max-w-[13rem] cursor-pointer"
                                    title="Your city branches"
                                    aria-label="Your city branches"
                                >
                                    <option value="all">
                                        {cities.find((city) => city.id === selectedCityId)?.name || 'City'} · All branches
                                    </option>
                                    {branches.map((branch) => (
                                        <option key={branch.id} value={branch.id}>
                                            {(cities.find((city) => city.id === branch.cityId)?.name || 'City')} · {branch.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : locationLabel ? (
                            <button
                                type="button"
                                onClick={onChangeLocation}
                                disabled={!onChangeLocation}
                                className="inline-flex items-center gap-1.5 max-w-[6.5rem] xs:max-w-[9rem] sm:max-w-[14rem] px-2 sm:px-3 py-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-muted)] text-xs font-medium text-[var(--brand-dark)] disabled:cursor-default"
                                title={canSwitchLocation(userRole) ? 'Switch city or branch' : locationLabel}
                            >
                                <MapPin size={14} className="shrink-0" />
                                <span className="truncate">{locationLabel}</span>
                            </button>
                        ) : null}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="mobile-menu-button text-[var(--brand-border)] hover:text-[var(--brand-dark)] hover:bg-[var(--brand-muted)] relative"
                                aria-label="Notifications"
                            >
                                <Bell size={20} />
                                {notifications.length > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[var(--brand-accent)] rounded-full border-2 border-white"></span>
                                )}
                            </button>
                            {showNotifications && (
                                <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-[var(--brand-surface)] border border-[var(--brand-border)] rounded-xl shadow-lg z-50 overflow-hidden">
                                    <div className="p-3 border-b border-[var(--brand-border)] bg-[var(--brand-muted)]">
                                        <h3 className="font-semibold text-[var(--brand-dark)]">Notifications</h3>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto">
                                        {notifications.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-[var(--brand-border)]">
                                                No notifications
                                            </div>
                                        ) : (
                                            notifications.map((notif) => (
                                                <div key={notif.id} className="p-3 border-b border-[var(--brand-border)] last:border-0 hover:bg-[var(--brand-muted)] transition-colors">
                                                    <p className="text-sm text-[var(--brand-dark)]">{notif.message}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onLogout}
                            className="inline-flex items-center gap-1.5 shrink-0 rounded-full bg-[var(--brand-dark)] px-2.5 sm:px-3 py-2 text-[var(--brand-text-light)] hover:bg-[var(--brand-accent)] hover:text-[var(--brand-dark)] transition-colors"
                            aria-label="Sign out"
                            title="Sign out"
                        >
                            <LogOut size={16} />
                            <span className="text-xs font-semibold">Sign out</span>
                        </button>
                    </div>
                </header>

                <div className={`flex-1 flex flex-col min-h-0 ${fillViewport ? 'overflow-hidden p-2 sm:p-3 md:p-4 lg:p-6' : 'overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8'}`}>
                    <div className={`max-w-7xl mx-auto w-full flex-1 min-h-0 flex flex-col ${fillViewport ? 'h-full' : ''}`}>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Layout;
