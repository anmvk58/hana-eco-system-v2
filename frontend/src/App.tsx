import { Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AccessControlPage } from "./pages/AccessControlPage";
import { ForbiddenPage } from "./pages/ForbiddenPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoiceDetailPage } from "./pages/InvoiceDetailPage";
import { InvoiceFormPage } from "./pages/InvoiceFormPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { LoginPage } from "./pages/LoginPage";
import { SoldProductsReportPage } from "./pages/SoldProductsReportPage";
import { useAuth } from "./auth/AuthContext";

export default function App() {
  const { currentUser, loading } = useAuth();
  if (loading) return <main className="login-page"><div className="login-card">Đang kiểm tra phiên đăng nhập...</div></main>;
  if (!currentUser) return <LoginPage />;
  const protect = (permission: string | string[], page: ReactNode) => <ProtectedRoute permissions={Array.isArray(permission) ? permission : [permission]}>{page}</ProtectedRoute>;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={protect("dashboard.view", <DashboardPage />)} />
        <Route path="/customers" element={protect("customers.view", <CustomersPage />)} />
        <Route path="/products" element={protect("products.view", <ProductsPage />)} />
        <Route path="/invoices" element={protect("invoices.view", <InvoicesPage />)} />
        <Route path="/invoices/new" element={protect("invoices.create", <InvoiceFormPage />)} />
        <Route path="/invoices/:invoiceId" element={protect("invoices.view", <InvoiceDetailPage />)} />
        <Route path="/invoices/:invoiceId/edit" element={protect("invoices.update", <InvoiceFormPage />)} />
        <Route path="/reports" element={protect("reports.view", <ReportsPage />)} />
        <Route path="/reports/sold-products" element={protect("reports.sold_products.view", <SoldProductsReportPage />)} />
        <Route path="/access-control" element={protect(["users.view", "roles.view"], <AccessControlPage />)} />
        <Route path="/forbidden" element={<ForbiddenPage />} />
      </Routes>
    </Layout>
  );
}

