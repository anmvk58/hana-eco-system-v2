import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  Gauge,
  Menu,
  PlusCircle,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

const navItems = [
  { to: "/", label: "Tổng quan", icon: Gauge },
  { to: "/customers", label: "Khách hàng", icon: Users },
  { to: "/products", label: "Sản phẩm", icon: Boxes },
  { to: "/invoices/new", label: "Bán hàng", icon: PlusCircle },
  { to: "/invoices", label: "Hóa đơn", icon: ClipboardList },
  { to: "/reports", label: "Báo cáo", icon: BarChart3 },
];

const routeTitles: Record<string, string> = {
  "/": "Tổng quan bán hàng",
  "/customers": "Quản lý khách hàng",
  "/products": "Quản lý sản phẩm",
  "/invoices": "Danh sách hóa đơn",
  "/invoices/new": "Tạo hóa đơn bán hàng",
  "/reports": "Báo cáo bán hàng",
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const title = routeTitles[location.pathname] ?? (location.pathname.startsWith("/invoices/") ? "Chi tiết hóa đơn" : "Hana POS");
  const isSalesPage = location.pathname === "/invoices/new";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">H</div>
          <div>
            <strong>Hana POS</strong>
            <span>MVP bán hàng</span>
          </div>
        </div>
        <nav className="side-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === "/" || item.to === "/invoices"}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
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
          {!isSalesPage ? (
            <div className="global-actions">
              <button className="primary-button" type="button" onClick={() => navigate("/invoices/new")}>
                <FileText size={17} />
                Tạo hóa đơn
              </button>
            </div>
          ) : null}
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
