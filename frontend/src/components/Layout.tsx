import {
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Gauge,
  LibraryBig,
  LoaderCircle,
  LogOut,
  Menu,
  PackageSearch,
  ShieldCheck,
  ShoppingCart,
  Users,
  Truck,
  PackageCheck,
  History,
  Handshake,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  { to: "/", label: "Tổng quan", icon: Gauge, permissions: ["dashboard.view"] },
  { to: "/invoices/new", label: "Bán hàng", icon: ShoppingCart, permissions: ["invoices.create"] },
  { to: "/invoices", label: "Hóa đơn", icon: ClipboardList, permissions: ["invoices.view"] },
  { to: "/ship-management", label: "Quản lý đơn ship", icon: Handshake, permissions: ["shipping.manage"] },
  { to: "/shipping/claim", label: "Nhận đơn ship", icon: PackageCheck, permissions: ["shipping.claim"], shipperOnly: true },
  { to: "/shipping/received", label: "Đơn đã nhận", icon: History, permissions: ["shipping.claim"], shipperOnly: true },
];

const catalogNavItems = [
  { to: "/customers", label: "Khách hàng", icon: Users, permissions: ["customers.view"] },
  { to: "/products", label: "Sản phẩm", icon: Boxes, permissions: ["products.view"] },
];

const reportNavItems = [
  { to: "/reports", label: "Báo cáo chung", icon: BarChart3, permissions: ["reports.view"] },
  { to: "/reports/sold-products", label: "Hàng hóa bán được", icon: PackageSearch, permissions: ["reports.sold_products.view"] },
];

const accessControlNavItem = {
  to: "/access-control",
  label: "Người dùng & role",
  icon: ShieldCheck,
  permissions: ["users.view", "roles.view"],
};

const shipperManagementNavItem = {
  to: "/shippers",
  label: "Shipper nội bộ",
  icon: Truck,
  permissions: ["shippers.view"],
};

const routeTitles: Record<string, string> = {
  "/": "Tổng quan bán hàng",
  "/customers": "Quản lý khách hàng",
  "/products": "Quản lý sản phẩm",
  "/invoices": "Danh sách hóa đơn",
  "/invoices/new": "Tạo hóa đơn bán hàng",
  "/reports": "Báo cáo bán hàng",
  "/reports/sold-products": "Báo cáo hàng hóa bán được",
  "/access-control": "Người dùng & phân quyền",
  "/shippers": "Quản lý shipper nội bộ",
  "/shipping/claim": "Nhận đơn ship",
  "/shipping/received": "Đơn đã nhận",
  "/ship-management": "Quản lý đơn ship",
  "/forbidden": "Không có quyền truy cập",
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, hasPermission, logout } = useAuth();
  const [isCatalogOpen, setIsCatalogOpen] = useState(
    () => location.pathname === "/customers" || location.pathname === "/products",
  );
  const [isReportsOpen, setIsReportsOpen] = useState(() => location.pathname.startsWith("/reports"));
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => window.localStorage.getItem("hana-sidebar-collapsed") === "true",
  );
  const title = routeTitles[location.pathname] ?? (location.pathname.startsWith("/invoices/") ? "Chi tiết hóa đơn" : "Hana POS");
  const isSalesPage = location.pathname === "/invoices/new";
  const visibleCatalogItems = catalogNavItems.filter((item) => item.permissions.every(hasPermission));
  const visibleReportItems = reportNavItems.filter((item) => item.permissions.every(hasPermission));
  const userInitial = currentUser?.display_name.trim().charAt(0).toLocaleUpperCase("vi-VN") || "U";

  useEffect(() => {
    window.localStorage.setItem("hana-sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      await new Promise((resolve) => window.setTimeout(resolve, 340));
    }
    await logout();
  }

  return (
    <div className={`app-shell${isSidebarCollapsed ? " sidebar-collapsed" : ""}${isLoggingOut ? " auth-logging-out" : ""}`}>
      <aside className={`sidebar${isMobileSidebarOpen ? " mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">H</div>
          <div className="brand-copy">
            <strong>Hana POS</strong>
            <span>MVP bán hàng</span>
          </div>
          <button
            className="sidebar-collapse-button"
            type="button"
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={isSidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            title={isSidebarCollapsed ? "Mở rộng" : "Thu gọn"}
          >
            {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <nav className="side-nav">
          {navItems.filter((item) => item.permissions.every(hasPermission) && (!("shipperOnly" in item) || !item.shipperOnly || Boolean(currentUser?.shipper_id))).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} title={item.label} end={item.to === "/" || item.to === "/invoices" || item.to === "/reports"}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          {visibleCatalogItems.length > 0 ? (
            <div className="nav-group">
              <button
                className={`nav-group-toggle${location.pathname === "/customers" || location.pathname === "/products" ? " active" : ""}`}
                type="button"
                aria-expanded={isCatalogOpen}
                aria-controls="catalog-navigation"
                title="Danh mục"
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setIsCatalogOpen(true);
                    return;
                  }
                  setIsCatalogOpen((open) => !open);
                }}
              >
                <LibraryBig size={18} />
                <span>Danh mục</span>
                <ChevronDown className={`nav-group-chevron${isCatalogOpen ? " open" : ""}`} size={17} />
              </button>
              {isCatalogOpen ? <div className="nav-group-items" id="catalog-navigation">
                {visibleCatalogItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to} title={item.label}>
                      <Icon size={17} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div> : null}
            </div>
          ) : null}
          {visibleReportItems.length > 0 ? (
            <div className="nav-group">
              <button
                className={`nav-group-toggle${location.pathname.startsWith("/reports") ? " active" : ""}`}
                type="button"
                aria-expanded={isReportsOpen}
                aria-controls="report-navigation"
                title="Báo cáo"
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setIsReportsOpen(true);
                    return;
                  }
                  setIsReportsOpen((open) => !open);
                }}
              >
                <BarChart3 size={18} />
                <span>Báo cáo</span>
                <ChevronDown className={`nav-group-chevron${isReportsOpen ? " open" : ""}`} size={17} />
              </button>
              {isReportsOpen ? <div className="nav-group-items" id="report-navigation">
                {visibleReportItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to} title={item.label} end={item.to === "/reports"}>
                      <Icon size={17} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div> : null}
            </div>
          ) : null}
          {accessControlNavItem.permissions.every(hasPermission) ? (
            <NavLink to={accessControlNavItem.to} title={accessControlNavItem.label}>
              <ShieldCheck size={18} />
              <span>{accessControlNavItem.label}</span>
            </NavLink>
          ) : null}
          {shipperManagementNavItem.permissions.every(hasPermission) ? (
            <NavLink to={shipperManagementNavItem.to} title={shipperManagementNavItem.label}>
              <Truck size={18} />
              <span>{shipperManagementNavItem.label}</span>
            </NavLink>
          ) : null}
        </nav>
      </aside>
      <button
        className={`sidebar-backdrop${isMobileSidebarOpen ? " visible" : ""}`}
        type="button"
        aria-label="Đóng menu"
        onClick={() => setIsMobileSidebarOpen(false)}
      />

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              type="button"
              aria-label={isMobileSidebarOpen ? "Đóng menu" : "Mở menu"}
              aria-expanded={isMobileSidebarOpen}
              onClick={() => setIsMobileSidebarOpen((open) => !open)}
            >
              <Menu size={20} />
            </button>
            <div>
              <h1>{title}</h1>
              <span className="breadcrumb">Hana POS / {title}</span>
            </div>
          </div>
          <div className="global-actions">
            <div className="user-switcher">
              <span className="user-avatar" aria-hidden="true">{userInitial}</span>
              <span className="user-copy"><small>Xin chào</small><strong>{currentUser?.display_name}</strong></span>
            </div>
          {!isSalesPage && hasPermission("invoices.create") ? (
              <button className="primary-button" type="button" onClick={() => navigate("/invoices/new")}>
                <ShoppingCart size={17} />
                Bán hàng
              </button>
          ) : null}
            <button className="icon-button topbar-logout-button" type="button" disabled={isLoggingOut} onClick={() => void handleLogout()} aria-label="Đăng xuất" title="Đăng xuất">
              {isLoggingOut ? <LoaderCircle className="loading-spinner" size={18} /> : <LogOut size={18} />}
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
