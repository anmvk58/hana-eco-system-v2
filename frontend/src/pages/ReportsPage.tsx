import { BadgePercent, CalendarDays, ExternalLink, Package, Search, Truck, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import type { DashboardTimePreset, Invoice } from "../types";
import { money, numberText, todayInputValue } from "../utils/format";

interface ProductRevenue {
  key: string;
  name: string;
  quantity: number;
  revenue: number;
}

const timePresets: Array<{ value: DashboardTimePreset; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "last7days", label: "7 ngày qua" },
  { value: "thisMonth", label: "Tháng này" },
  { value: "custom", label: "Khoảng ngày" },
];

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function ReportsPage() {
  const { hasPermission } = useAuth();
  const [appliedRange, setAppliedRange] = useState({ from: todayInputValue(), to: todayInputValue() });
  const [fromDate, setFromDate] = useState(todayInputValue());
  const [toDate, setToDate] = useState(todayInputValue());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [productFilter, setProductFilter] = useState("");
  const [error, setError] = useState("");
  const [timePreset, setTimePreset] = useState<DashboardTimePreset>("today");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setError("");
    if ((fromDate && !toDate) || (!fromDate && toDate)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const range = { from: fromDate, to: toDate };
    void api.invoices.listAll({ exclude_cancelled: true, from_date: range.from || undefined, to_date: range.to || undefined })
      .then((data) => {
        if (!active) return;
        setInvoices(data);
        setAppliedRange(range);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Không tải được báo cáo");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [fromDate, toDate]);

  function selectPreset(preset: DashboardTimePreset) {
    setTimePreset(preset);
    if (preset === "custom") return;
    const today = todayInputValue();
    const to = preset === "yesterday" ? shiftDate(today, -1) : today;
    const from = preset === "last7days" ? shiftDate(today, -6) : preset === "thisMonth" ? `${today.slice(0, 8)}01` : to;
    setFromDate(from);
    setToDate(to);
  }

  function invoiceUrl(item: ProductRevenue) {
    const params = new URLSearchParams({
      product_code: item.key,
      product_name: item.name,
      status: "active",
      from_date: appliedRange.from,
      to_date: appliedRange.to,
    });
    return `/invoices?${params.toString()}`;
  }

  const summary = useMemo(() => {
    const revenue = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0);
    const subtotal = invoices.reduce((sum, invoice) => sum + Number(invoice.subtotal), 0);
    const shipping = invoices.reduce((sum, invoice) => sum + chargeTotal(invoice, "shipping"), 0);
    const discount = invoices.reduce((sum, invoice) => sum + Number(invoice.discount_amount), 0);
    return { revenue, subtotal, shipping, discount };
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

  const filteredProducts = useMemo(() => {
    const keyword = normalizeProductName(productFilter.trim());
    return keyword ? byProduct.filter((item) => normalizeProductName(item.name).includes(keyword)) : byProduct;
  }, [byProduct, productFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach((invoice) => {
      const key = invoice.sold_at.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + Number(invoice.total_amount));
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [invoices]);

  return (
    <div className="page-stack" aria-busy={loading}>
      <section className="dashboard-period-filter">
        <div className="dashboard-period-label"><CalendarDays size={18} />Thời gian báo cáo</div>
        <div className="dashboard-period-options" role="group" aria-label="Chọn nhanh thời gian báo cáo">
          {timePresets.map((preset) => (
            <button key={preset.value} type="button" className={timePreset === preset.value ? "active" : ""} aria-pressed={timePreset === preset.value} onClick={() => selectPreset(preset.value)}>
              {preset.label}
            </button>
          ))}
        </div>
        {timePreset === "custom" ? <DateRangePicker from={fromDate} to={toDate} onChange={(from, to) => { setFromDate(from); setToDate(to); }} /> : null}
        {loading ? <span role="status" className="invoice-filter-loading">Đang tải báo cáo...</span> : null}
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="metric-grid">
        <ReportMetric label="Doanh thu" value={money(summary.revenue)} icon={Wallet} tone="revenue" />
        <ReportMetric label="Tiền hàng" value={money(summary.subtotal)} icon={Package} tone="subtotal" />
        <ReportMetric label="Phí ship" value={money(summary.shipping)} icon={Truck} tone="shipping" />
        <ReportMetric label="Tổng giảm giá" value={money(summary.discount)} icon={BadgePercent} tone="discount" />
      </section>

      <section className="dashboard-grid">
        <div className="table-panel">
          <div className="panel-header">
            <div>
              <h2>Doanh thu theo sản phẩm</h2>
              <span>Sắp xếp theo doanh thu giảm dần</span>
            </div>
          </div>
          <div className="sold-products-filter report-product-filter">
            <Search size={17} aria-hidden="true" />
            <input
              type="text"
              aria-label="Lọc tên sản phẩm trong báo cáo"
              placeholder="Nhập tên sản phẩm cần xem..."
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
            />
          </div>
          <table className="data-table product-revenue-table">
            <colgroup>
              <col style={{ width: "50%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "30%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th className="numeric">Số lượng bán</th>
                <th className="numeric">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((item) => (
                <tr key={item.key}>
                  <td className="code-cell">
                    {hasPermission("invoices.view") ? (
                      <Link className="sold-product-invoice-link" to={invoiceUrl(item)} target="_blank" rel="noopener noreferrer" title={`Xem hóa đơn có ${item.name} trong tab mới`}>
                        {item.name}<ExternalLink size={14} aria-hidden="true" />
                      </Link>
                    ) : item.name}
                  </td>
                  <td className="numeric">{numberText(item.quantity, 3)}</td>
                  <td className="numeric strong">{money(item.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {byProduct.length === 0 ? <EmptyState title="Chưa có dữ liệu báo cáo" /> : null}
          {byProduct.length > 0 && filteredProducts.length === 0 ? <EmptyState title="Không tìm thấy sản phẩm phù hợp" description="Hãy thử tên sản phẩm khác." /> : null}
        </div>

        <div className="table-panel">
          <div className="panel-header">
            <div>
              <h2>Doanh thu theo ngày</h2>
              <span>Tính hóa đơn đã tạo và hoàn thành</span>
            </div>
          </div>
          <table className="data-table daily-revenue-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th className="numeric">Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map(([day, revenue]) => (
                <tr key={day}>
                  <td>{day.split("-").reverse().join("/")}</td>
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

function normalizeProductName(value: string) {
  return value.toLocaleLowerCase("vi-VN").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}

function chargeTotal(invoice: Invoice, type: "shipping" | "packing" | "other") {
  return invoice.extra_charges
    .filter((charge) => charge.charge_type === type)
    .reduce((sum, charge) => sum + Number(charge.amount), 0);
}

function ReportMetric({ label, value, icon: Icon, tone }: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "revenue" | "subtotal" | "shipping" | "discount";
}) {
  return (
    <div className={`report-metric-card report-metric-${tone}`}>
      <div className="report-metric-heading">
        <span>{label}</span>
        <div className="report-metric-icon" aria-hidden="true"><Icon size={21} strokeWidth={1.8} /></div>
      </div>
      <strong className="report-metric-value">{value}</strong>
    </div>
  );
}

