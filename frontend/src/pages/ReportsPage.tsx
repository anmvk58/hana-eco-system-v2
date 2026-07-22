import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import type { Invoice } from "../types";
import { dateOnly, money, todayInputValue } from "../utils/format";

interface ProductRevenue {
  key: string;
  name: string;
  quantity: number;
  revenue: number;
}

export function ReportsPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayInputValue());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");

  async function loadReports() {
    setError("");
    try {
      setInvoices(await api.invoices.list({ status: "created", from_date: fromDate || undefined, to_date: toDate || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được báo cáo");
    }
  }

  useEffect(() => {
    void loadReports();
  }, []);

  const summary = useMemo(() => {
    const revenue = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0);
    const subtotal = invoices.reduce((sum, invoice) => sum + Number(invoice.subtotal), 0);
    const shipping = invoices.reduce((sum, invoice) => sum + chargeTotal(invoice, "shipping"), 0);
    const packing = invoices.reduce((sum, invoice) => sum + chargeTotal(invoice, "packing"), 0);
    const other = invoices.reduce((sum, invoice) => sum + chargeTotal(invoice, "other"), 0);
    return { revenue, subtotal, shipping, packing, other };
  }, [invoices]);

  const byProduct = useMemo(() => {
    const map = new Map<string, ProductRevenue>();
    invoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        const key = item.product_code;
        const current = map.get(key) ?? { key, name: item.product_name, quantity: 0, revenue: 0 };
        current.quantity += Number(item.quantity);
        current.revenue += Number(item.line_total);
        map.set(key, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [invoices]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach((invoice) => {
      const key = invoice.sold_at.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + Number(invoice.total_amount));
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [invoices]);

  return (
    <div className="page-stack">
      <section className="toolbar">
        <DateRangePicker from={fromDate} to={toDate} onChange={(from, to) => { setFromDate(from); setToDate(to); }} />
        <button className="secondary-button" type="button" onClick={() => void loadReports()}>
          <Search size={17} />
          Xem báo cáo
        </button>
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="metric-grid">
        <ReportMetric label="Doanh thu" value={money(summary.revenue)} />
        <ReportMetric label="Tiền hàng" value={money(summary.subtotal)} />
        <ReportMetric label="Phí ship" value={money(summary.shipping)} />
        <ReportMetric label="Phí đóng hàng" value={money(summary.packing)} />
        <ReportMetric label="Phụ thu khác" value={money(summary.other)} />
      </section>

      <section className="dashboard-grid">
        <div className="table-panel">
          <div className="panel-header">
            <div>
              <h2>Doanh thu theo sản phẩm</h2>
              <span>Sắp xếp theo doanh thu giảm dần</span>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã SP</th>
                <th>Sản phẩm</th>
                <th>Số lượng bán</th>
                <th>Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((item) => (
                <tr key={item.key}>
                  <td className="code-cell">{item.key}</td>
                  <td>{item.name}</td>
                  <td className="numeric">{item.quantity}</td>
                  <td className="numeric strong">{money(item.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {byProduct.length === 0 ? <EmptyState title="Chưa có dữ liệu báo cáo" /> : null}
        </div>

        <div className="table-panel">
          <div className="panel-header">
            <div>
              <h2>Doanh thu theo ngày</h2>
              <span>Chỉ tính hóa đơn đã tạo</span>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map(([day, revenue]) => (
                <tr key={day}>
                  <td>{dateOnly(day)}</td>
                  <td className="numeric strong">{money(revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {byDay.length === 0 ? <EmptyState title="Chưa có doanh thu trong kỳ" /> : null}
        </div>
      </section>
    </div>
  );
}

function chargeTotal(invoice: Invoice, type: "shipping" | "packing" | "other") {
  return invoice.extra_charges
    .filter((charge) => charge.charge_type === type)
    .reduce((sum, charge) => sum + Number(charge.amount), 0);
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card compact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

