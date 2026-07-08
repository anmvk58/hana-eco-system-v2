import { BarChart3, Boxes, ClipboardCheck, ReceiptText, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import type { Customer, Invoice, Product } from "../types";
import { dateTime, money } from "../utils/format";

export function DashboardPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [customerData, productData, invoiceData] = await Promise.all([
        api.customers.list(),
        api.products.list(),
        api.invoices.list(),
      ]);
      setCustomers(customerData);
      setProducts(productData);
      setInvoices(invoiceData);
    }
    void load().catch((err) => setError(err instanceof Error ? err.message : "Không tải được tổng quan"));
  }, []);

  const completedInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "completed"), [invoices]);
  const revenue = completedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0);
  const extraCharges = completedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_extra_charges), 0);
  const lowStockCount = products.filter((product) => Number(product.stock_quantity) <= 5).length;

  return (
    <div className="page-stack">
      {error ? <div className="alert error">{error}</div> : null}
      <section className="metric-grid">
        <MetricCard icon={<ReceiptText />} label="Doanh thu hoàn thành" value={money(revenue)} />
        <MetricCard icon={<ClipboardCheck />} label="Hóa đơn" value={String(invoices.length)} />
        <MetricCard icon={<Users />} label="Khách hàng" value={String(customers.length)} />
        <MetricCard icon={<Boxes />} label="Sản phẩm sắp hết" value={String(lowStockCount)} />
      </section>

      <section className="dashboard-grid">
        <div className="table-panel">
          <div className="panel-header">
            <div>
              <h2>Hóa đơn gần đây</h2>
              <span>Theo ngày bán mới nhất</span>
            </div>
            <Link to="/invoices" className="link-button secondary-button">Xem tất cả</Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Khách</th>
                <th>Trạng thái</th>
                <th>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 6).map((invoice) => (
                <tr key={invoice.id}>
                  <td className="code-cell">{invoice.code}</td>
                  <td>{invoice.customer?.name ?? "Khách lẻ"}</td>
                  <td><StatusBadge status={invoice.status} /></td>
                  <td className="numeric strong">{money(invoice.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 ? <EmptyState title="Chưa có hóa đơn" /> : null}
        </div>

        <div className="insight-panel">
          <div className="panel-header">
            <div>
              <h2>Tóm tắt vận hành</h2>
              <span>Dữ liệu lấy trực tiếp từ API hiện tại</span>
            </div>
            <BarChart3 size={20} />
          </div>
          <div className="summary-lines">
            <div><span>Hóa đơn hoàn thành</span><strong>{completedInvoices.length}</strong></div>
            <div><span>Tổng thu phí</span><strong>{money(extraCharges)}</strong></div>
            <div><span>Sản phẩm đang bán</span><strong>{products.filter((item) => item.status === "active").length}</strong></div>
            <div><span>Cập nhật cuối</span><strong>{invoices[0] ? dateTime(invoices[0].updated_at) : "-"}</strong></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
