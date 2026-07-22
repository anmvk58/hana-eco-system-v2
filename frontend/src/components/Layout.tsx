import {
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Gauge,
  Menu,
  PlusCircle,
  PackageSearch,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  { to: "/", label: "Tổng quan", icon: Gauge, permissions: ["dashboard.view"] },
  { to: "/customers", label: "Khách hàng", icon: Users, permissions: ["customers.view"] },
  { to: "/products", label: "Sản phẩm", icon: Boxes, permissions: ["products.view"] },
  { to: "/invoices/new", label: "Bán hàng", icon: PlusCircle, permissions: ["invoices.create"] },
  { to: "/invoices", label: "Hóa đơn", icon: ClipboardList, permissions: ["invoices.view"] },
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

const routeTitles: Record<string, string> = {
  "/": "Tổng quan bán hàng",
  "/customers": "Quản lý khách hàng",
  "/products": "Quản lý sản phẩm",
  "/invoices": "Danh sách hóa đơn",
  "/invoices/new": "Tạo hóa đơn bán hàng",
  "/reports": "Báo cáo bán hàng",
  "/reports/sold-products": "Báo cáo hàng hóa bán được",
  "/access-control": "Người dùng & phân quyền",
  "/forbidden": "Không có quyền truy cập",
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, hasPermission, logout } = useAuth();
  const [isReportsOpen, setIsReportsOpen] = useState(() => location.pathname.startsWith("/reports"));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => window.localStorage.getItem("hana-sidebar-collapsed") === "true",
  );
  const title = routeTitles[location.pathname] ?? (location.pathname.startsWith("/invoices/") ? "Chi tiết hóa đơn" : "Hana POS");
  const isSalesPage = location.pathname === "/invoices/new";
  const visibleReportItems = reportNavItems.filter((item) => item.permissions.every(hasPermission));

  useEffect(() => {
    window.localStorage.setItem("hana-sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <div className={`app-shell${isSidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
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
          {navItems.filter((item) => item.permissions.every(hasPermission)).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} title={item.label} end={item.to === "/" || item.to === "/invoices" || item.to === "/reports"}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
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
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" type="button" aria-label="Mở menu">
              <Menu size={20} />
            </button>
            <div>
              <h1>{title}</h1>
              <span className="breadcrumb">Hana POS / {title}</span>
            </div>
          </div>
          <div className="global-actions">
            <div className="user-switcher"><span>Xin chào</span><strong>{currentUser?.display_name}</strong></div>
          {!isSalesPage && hasPermission("invoices.create") ? (
              <button className="primary-button" type="button" onClick={() => navigate("/invoices/new")}>
                <FileText size={17} />
                Tạo hóa đơn
              </button>
          ) : null}
            <button className="secondary-button" type="button" onClick={() => void logout()}>Đăng xuất</button>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
