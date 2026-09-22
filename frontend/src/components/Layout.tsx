import {
  BarChart3,
  Banknote,
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
  ClipboardCheck,
  KeyRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { matchPath, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePageTitle } from "../hooks/usePageTitle";

const navItems = [
  { to: "/", label: "Tổng quan", icon: Gauge, permissions: ["dashboard.view"] },
  { to: "/invoices/new", label: "Bán hàng", icon: ShoppingCart, permissions: ["invoices.create"] },
  { to: "/invoices", label: "Hóa đơn", icon: ClipboardList, permissions: ["invoices.view"] },
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

const shipManagementNavItems = [
  { to: "/ship-management", label: "Bàn giao đơn", icon: Handshake, permissions: ["shipping.manage"] },
  { to: "/ship-management/internal-handover", label: "Bàn giao Ship Nội Bộ", icon: Truck, permissions: ["shipping.manage"] },
  { to: "/ship-management/external-batches", label: "Bảng kê Ship Ngoài", icon: ClipboardList, permissions: ["shipping.manage"] },
];

const codManagementNavItems = [
  { to: "/cod-management/order-reconciliation", label: "Kiểm kê đơn", icon: ClipboardCheck, permissions: ["order_reconciliation.manage"] },
  { to: "/cod-management/internal-collections", label: "Thu tiền Ship Nội Bộ", icon: Banknote, permissions: ["shipping.manage"] },
  { to: "/cod-management/internal-collection-history", label: "Lịch sử thu tiền COD", icon: History, permissions: ["shipping.manage"] },
];

const accessControlNavItems = [
  { to: "/access-control", label: "Quản lý người dùng & Role", icon: ShieldCheck, permissions: ["users.view", "roles.view"] },
  { to: "/account/change-password", label: "Đổi mật khẩu", icon: KeyRound, permissions: [] },
];

const shipperManagementNavItem = {
  to: "/shippers",
  label: "Shipper nội bộ",
  icon: Truck,
  permissions: ["shippers.view"],
};

const pageTitleItems = [
  ...navItems,
  ...catalogNavItems,
  ...reportNavItems,
  ...shipManagementNavItems,
  ...codManagementNavItems,
  ...accessControlNavItems,
  shipperManagementNavItem,
  { to: "/invoices/:invoiceId/edit", label: "Sửa hóa đơn" },
  { to: "/invoices/:invoiceId", label: "Chi tiết hóa đơn" },
  { to: "/forbidden", label: "Không có quyền truy cập" },
];

const routeTitles: Record<string, string> = {
  "/": "Tổng quan bán hàng",
  "/customers": "Quản lý khách hàng",
  "/products": "Quản lý sản phẩm",
  "/invoices": "Danh sách hóa đơn",
  "/invoices/new": "Tạo hóa đơn bán hàng",
  "/reports": "Báo cáo bán hàng",
  "/reports/sold-products": "Báo cáo hàng hóa bán được",
  "/access-control": "Người dùng & phân quyền",
  "/account/change-password": "Đổi mật khẩu",
  "/shippers": "Quản lý shipper nội bộ",
  "/shipping/claim": "Nhận đơn ship",
  "/shipping/received": "Đơn đã nhận",
  "/ship-management": "Quản lý đơn ship",
  "/ship-management/internal-handover": "Bàn giao Ship Nội Bộ",
  "/cod-management/internal-collections": "Thu tiền Ship Nội Bộ",
  "/cod-management/internal-collection-history": "Lịch sử thu tiền COD",
  "/cod-management/order-reconciliation": "Kiểm kê đơn",
  "/ship-management/external-batches": "Bảng kê bàn giao Ship Ngoài",
  "/forbidden": "Không có quyền truy cập",
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, hasPermission, logout } = useAuth();
  const pageTitle = pageTitleItems.find((item) => matchPath(item.to, location.pathname))?.label ?? "Hana POS";
  usePageTitle(pageTitle);
  const [isCatalogOpen, setIsCatalogOpen] = useState(
    () => location.pathname === "/customers" || location.pathname === "/products",
  );
  const [isReportsOpen, setIsReportsOpen] = useState(() => location.pathname.startsWith("/reports"));
  const [isShipManagementOpen, setIsShipManagementOpen] = useState(() => location.pathname.startsWith("/ship-management"));
  const [isCodManagementOpen, setIsCodManagementOpen] = useState(() => location.pathname.startsWith("/cod-management"));
  const [isAccessControlOpen, setIsAccessControlOpen] = useState(() => location.pathname === "/access-control" || location.pathname.startsWith("/account/"));
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => window.localStorage.getItem("hana-sidebar-collapsed") === "true",
  );
  const title = routeTitles[location.pathname] ?? (location.pathname.startsWith("/invoices/") ? "Chi tiết hóa đơn" : "Hana POS");
  const isSalesPage = location.pathname === "/invoices/new"
    || /^\/invoices\/\d+\/edit$/.test(location.pathname);
  const visibleCatalogItems = catalogNavItems.filter((item) => item.permissions.every(hasPermission));
  const visibleReportItems = reportNavItems.filter((item) => item.permissions.every(hasPermission));
  const visibleShipManagementItems = shipManagementNavItems.filter((item) => item.permissions.every(hasPermission));
  const visibleCodManagementItems = codManagementNavItems.filter((item) => item.permissions.every(hasPermission));
  const visibleAccessControlItems = accessControlNavItems.filter((item) => item.permissions.every(hasPermission));
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
    <div className={`app-shell${isSidebarCollapsed ? " sidebar-collapsed" : ""}${isLoggingOut ? " auth-logging-out" : ""}${isSalesPage ? " sales-shell" : ""}`}>
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
          {visibleShipManagementItems.length > 0 ? (
            <div className="nav-group">
              <button
                className={`nav-group-toggle${location.pathname.startsWith("/ship-management") ? " active" : ""}`}
                type="button"
                aria-expanded={isShipManagementOpen}
                aria-controls="ship-management-navigation"
                title="Quản lý đơn ship"
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setIsShipManagementOpen(true);
                    return;
                  }
                  setIsShipManagementOpen((open) => !open);
                }}
              >
                <Handshake size={18}/><span>Quản lý đơn ship</span><ChevronDown className={`nav-group-chevron${isShipManagementOpen ? " open" : ""}`} size={17}/>
              </button>
              {isShipManagementOpen ? <div className="nav-group-items" id="ship-management-navigation">
                {visibleShipManagementItems.map((item) => {
                  const Icon = item.icon;
                  return <NavLink key={item.to} to={item.to} title={item.label} end={item.to === "/ship-management"}><Icon size={17}/><span>{item.label}</span></NavLink>;
                })}
              </div> : null}
            </div>
          ) : null}
          {visibleCodManagementItems.length > 0 ? (
            <div className="nav-group">
              <button
                className={`nav-group-toggle${location.pathname.startsWith("/cod-management") ? " active" : ""}`}
                type="button"
                aria-expanded={isCodManagementOpen}
                aria-controls="cod-management-navigation"
                title="Quản lý tiền COD"
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setIsCodManagementOpen(true);
                    return;
                  }
                  setIsCodManagementOpen((open) => !open);
                }}
              >
                <Banknote size={18}/><span>Quản lý tiền COD</span><ChevronDown className={`nav-group-chevron${isCodManagementOpen ? " open" : ""}`} size={17}/>
              </button>
              {isCodManagementOpen ? <div className="nav-group-items" id="cod-management-navigation">
                {visibleCodManagementItems.map((item) => {
                  const Icon = item.icon;
                  return <NavLink key={item.to} to={item.to} title={item.label}><Icon size={17}/><span>{item.label}</span></NavLink>;
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
          {visibleAccessControlItems.length > 0 ? (
            <div className="nav-group">
              <button
                className={`nav-group-toggle${location.pathname === "/access-control" || location.pathname.startsWith("/account/") ? " active" : ""}`}
                type="button"
                aria-expanded={isAccessControlOpen}
                aria-controls="access-control-navigation"
                title="Người dùng & Role"
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false);
                    setIsAccessControlOpen(true);
                    return;
                  }
                  setIsAccessControlOpen((open) => !open);
                }}
              >
                <ShieldCheck size={18}/><span>Người dùng & Role</span><ChevronDown className={`nav-group-chevron${isAccessControlOpen ? " open" : ""}`} size={17}/>
              </button>
              {isAccessControlOpen ? <div className="nav-group-items" id="access-control-navigation">
                {visibleAccessControlItems.map((item) => {
                  const Icon = item.icon;
                  return <NavLink key={item.to} to={item.to} title={item.label}><Icon size={17}/><span>{item.label}</span></NavLink>;
                })}
              </div> : null}
            </div>
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
