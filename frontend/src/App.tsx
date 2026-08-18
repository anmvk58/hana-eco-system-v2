import { Navigate, Route, Routes } from "react-router-dom";
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
import { ShippersPage } from "./pages/ShippersPage";
import { ShippingClaimPage } from "./pages/ShippingClaimPage";
import { ShippingReceivedPage } from "./pages/ShippingReceivedPage";
import { ShipManagementPage } from "./pages/ShipManagementPage";
import { InternalShipperHandoverPage } from "./pages/InternalShipperHandoverPage";
import { InternalCodCollectionsPage } from "./pages/InternalCodCollectionsPage";
import { InternalCodCollectionHistoryPage } from "./pages/InternalCodCollectionHistoryPage";
import { ExternalHandoverBatchesPage } from "./pages/ExternalHandoverBatchesPage";
import { OrderReconciliationPage } from "./pages/OrderReconciliationPage";
import { useAuth } from "./auth/AuthContext";

export default function App() {
  const { currentUser, loading, hasPermission } = useAuth();
  if (loading) return <main className="login-page"><div className="login-card">Đang kiểm tra phiên đăng nhập...</div></main>;
  if (!currentUser) return <LoginPage />;
  const protect = (permission: string | string[], page: ReactNode) => <ProtectedRoute permissions={Array.isArray(permission) ? permission : [permission]}>{page}</ProtectedRoute>;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={hasPermission("dashboard.view") ? <DashboardPage /> : hasPermission("shipping.claim") ? <Navigate to="/shipping/claim" replace /> : <Navigate to="/forbidden" replace />} />
        <Route path="/customers" element={protect("customers.view", <CustomersPage />)} />
        <Route path="/products" element={protect("products.view", <ProductsPage />)} />
        <Route path="/invoices" element={protect("invoices.view", <InvoicesPage />)} />
        <Route path="/invoices/new" element={protect("invoices.create", <InvoiceFormPage />)} />
        <Route path="/invoices/:invoiceId" element={protect("invoices.view", <InvoiceDetailPage />)} />
        <Route path="/invoices/:invoiceId/edit" element={protect("invoices.update", <InvoiceFormPage />)} />
        <Route path="/reports" element={protect("reports.view", <ReportsPage />)} />
        <Route path="/reports/sold-products" element={protect("reports.sold_products.view", <SoldProductsReportPage />)} />
        <Route path="/access-control" element={protect(["users.view", "roles.view"], <AccessControlPage />)} />
        <Route path="/shippers" element={protect("shippers.view", <ShippersPage />)} />
        <Route path="/shipping/claim" element={protect("shipping.claim", <ShippingClaimPage />)} />
        <Route path="/shipping/received" element={protect("shipping.claim", <ShippingReceivedPage />)} />
        <Route path="/ship-management" element={protect("shipping.manage", <ShipManagementPage />)} />
        <Route path="/ship-management/internal-handover" element={protect("shipping.manage", <InternalShipperHandoverPage />)} />
        <Route path="/cod-management/internal-collections" element={protect("shipping.manage", <InternalCodCollectionsPage />)} />
        <Route path="/cod-management/internal-collection-history" element={protect("shipping.manage", <InternalCodCollectionHistoryPage />)} />
        <Route path="/cod-management/order-reconciliation" element={protect("shipping.manage", <OrderReconciliationPage />)} />
        <Route path="/ship-management/internal-cod-collections" element={<Navigate to="/cod-management/internal-collections" replace />} />
        <Route path="/ship-management/external-batches" element={protect("shipping.manage", <ExternalHandoverBatchesPage />)} />
        <Route path="/forbidden" element={<ForbiddenPage />} />
      </Routes>
    </Layout>
  );
}

