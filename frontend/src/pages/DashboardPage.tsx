import { CalendarDays, CircleDollarSign, ClipboardCheck, ReceiptText, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import type { Customer, Invoice } from "../types";
import { money, numberText } from "../utils/format";

type TimePreset = "today" | "7days" | "month" | "year";

const timePresets: Array<{ value: TimePreset; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "7days", label: "7 ngày qua" },
  { value: "month", label: "1 tháng qua" },
  { value: "year", label: "1 năm qua" },
];

interface RevenueChartPoint {
  key: string;
  label: string;
  fullLabel: string;
  value: number;
  showLabel: boolean;
}

interface ProductSalesSummary {
  key: string;
  name: string;
  quantity: number;
  revenue: number;
}

function localDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function revenueAxisMax(value: number) {
  if (value <= 0) return 0;
  const padded = value / 0.82;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(padded)) - 1);
  return Math.ceil(padded / step) * step;
}

function compactMoney(value: number) {
  if (value === 0) return "0 ₫";
  return `${new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value)} ₫`;
}

export function DashboardPage() {
  const { hasPermission } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [timePreset, setTimePreset] = useState<TimePreset>("today");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [customerData, invoiceData] = await Promise.all([
        api.customers.list(),
        api.invoices.list(),
      ]);
      setCustomers(customerData);
      setInvoices(invoiceData);
    }
    void load().catch((err) => setError(err instanceof Error ? err.message : "Không tải được tổng quan"));
  }, []);

  const timeRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (timePreset === "7days") start.setDate(start.getDate() - 6);
    if (timePreset === "month") start.setDate(start.getDate() - 29);
    if (timePreset === "year") {
      start.setDate(1);
      start.setMonth(start.getMonth() - 11);
    }
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
  }, [timePreset]);

  const revenueInvoices = useMemo(
    () => invoices.filter((invoice) => {
      const soldAt = new Date(invoice.sold_at).getTime();
      return invoice.status === "created" && soldAt >= timeRange.start && soldAt <= timeRange.end;
    }),
    [invoices, timeRange],
  );
  const createdInvoices = useMemo(
    () => invoices.filter((invoice) => {
      const createdAt = new Date(invoice.created_at).getTime();
      return invoice.status === "created" && createdAt >= timeRange.start && createdAt <= timeRange.end;
    }),
    [invoices, timeRange],
  );
  const createdCustomers = useMemo(
    () => customers.filter((customer) => {
      const createdAt = new Date(customer.created_at).getTime();
      return createdAt >= timeRange.start && createdAt <= timeRange.end;
    }),
    [customers, timeRange],
  );
  const productRevenue = revenueInvoices.reduce((sum, invoice) => sum + Number(invoice.subtotal), 0);
  const extraChargeRevenue = revenueInvoices.reduce((sum, invoice) => sum + Number(invoice.total_extra_charges), 0);
  const productSales = useMemo<ProductSalesSummary[]>(() => {
    const products = new Map<string, ProductSalesSummary>();
    revenueInvoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        const current = products.get(item.product_code) ?? {
          key: item.product_code,
          name: item.product_name,
          quantity: 0,
          revenue: 0,
        };
        current.quantity += Number(item.quantity);
        current.revenue += Number(item.line_total);
        products.set(item.product_code, current);
      });
    });
    return Array.from(products.values());
  }, [revenueInvoices]);
  const topProductsByQuantity = useMemo(
    () => [...productSales].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10),
    [productSales],
  );
  const topProductsByRevenue = useMemo(
    () => [...productSales].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity).slice(0, 10),
    [productSales],
  );
  const revenueChartData = useMemo<RevenueChartPoint[]>(() => {
    const totals = new Map<string, number>();
    revenueInvoices.forEach((invoice) => {
      const soldAt = new Date(invoice.sold_at);
      const key = timePreset === "today"
        ? String(soldAt.getHours())
        : timePreset === "year"
          ? monthKey(soldAt)
          : localDateKey(soldAt);
      totals.set(key, (totals.get(key) ?? 0) + Number(invoice.subtotal));
    });

    if (timePreset === "today") {
      return Array.from({ length: 24 }, (_, hour) => ({
        key: String(hour),
        label: `${String(hour).padStart(2, "0")}h`,
        fullLabel: `${String(hour).padStart(2, "0")}:00 – ${String(hour).padStart(2, "0")}:59`,
        value: totals.get(String(hour)) ?? 0,
        showLabel: hour % 2 === 0 || hour === 23,
      }));
    }

    if (timePreset === "year") {
      const firstMonth = new Date(timeRange.start);
      return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
        const key = monthKey(date);
        return {
          key,
          label: `T${date.getMonth() + 1}`,
          fullLabel: `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`,
          value: totals.get(key) ?? 0,
          showLabel: true,
        };
      });
    }

    const numberOfDays = timePreset === "7days" ? 7 : 30;
    const firstDay = new Date(timeRange.start);
    return Array.from({ length: numberOfDays }, (_, index) => {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() + index);
      const key = localDateKey(date);
      return {
        key,
        label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
        fullLabel: new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(date),
        value: totals.get(key) ?? 0,
        showLabel: numberOfDays === 7 || index % 5 === 0 || index === numberOfDays - 1,
      };
    });
  }, [revenueInvoices, timePreset, timeRange]);

  return (
    <div className="page-stack">
      {error ? <div className="alert error">{error}</div> : null}

      <section className="dashboard-period-filter" aria-label="Khoảng thời gian thống kê">
        <div className="dashboard-period-label"><CalendarDays size={18} /><span>Thời gian thống kê</span></div>
        <div className="dashboard-period-options">
          {timePresets.map((preset) => (
            <button
              className={timePreset === preset.value ? "active" : ""}
              key={preset.value}
              type="button"
              aria-pressed={timePreset === preset.value}
              onClick={() => setTimePreset(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className="metric-grid dashboard-metrics dashboard-metrics-refresh" key={timePreset}>
        <MetricCard icon={<ReceiptText />} label="Doanh thu thuần sản phẩm" value={money(productRevenue)} />
        <MetricCard icon={<CircleDollarSign />} label="Tổng tiền thu khác" value={money(extraChargeRevenue)} />
        <MetricCard icon={<ClipboardCheck />} label="Hóa đơn đã tạo" value={String(createdInvoices.length)} />
        <MetricCard icon={<Users />} label="Khách hàng đã tạo" value={String(createdCustomers.length)} />
      </section>

      <RevenueChart data={revenueChartData} preset={timePreset} />

      <section className="dashboard-top-charts" key={`top-products-${timePreset}`}>
        <HorizontalTopChart
          title="Top 10 sản phẩm theo số lượng"
          subtitle="Sản phẩm bán được nhiều nhất"
          data={topProductsByQuantity.map((product) => ({ key: product.key, name: product.name, value: product.quantity }))}
          valueType="quantity"
        />
        <HorizontalTopChart
          title="Top 10 sản phẩm theo doanh thu"
          subtitle="Sản phẩm có doanh thu cao nhất"
          data={topProductsByRevenue.map((product) => ({ key: product.key, name: product.name, value: product.revenue }))}
          valueType="revenue"
        />
      </section>

      <section className="dashboard-grid dashboard-single">
        <div className="table-panel">
          <div className="panel-header">
            <div>
              <h2>Hóa đơn gần đây</h2>
              <span>Theo ngày bán mới nhất</span>
            </div>
            {hasPermission("invoices.view") ? <Link to="/invoices" className="link-button secondary-button">Xem tất cả</Link> : null}
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

      </section>
    </div>
  );
}

function HorizontalTopChart({
  title,
  subtitle,
  data,
  valueType,
}: {
  title: string;
  subtitle: string;
  data: Array<{ key: string; name: string; value: number }>;
  valueType: "quantity" | "revenue";
}) {
  const maxValue = Math.max(...data.map((item) => item.value), 0);
  const formatValue = (value: number) => valueType === "revenue" ? money(value) : numberText(value, 3);
  const formatAxisValue = (value: number) => valueType === "revenue" ? compactMoney(value) : numberText(value, 3);

  return (
    <div className="horizontal-chart-panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
      </div>
      {data.length ? (
        <div className="horizontal-chart">
          <div className="horizontal-chart-rows">
            {data.map((item, index) => (
              <div className="horizontal-bar-row" key={item.key} title={`${item.name}: ${formatValue(item.value)}`}>
                <div className="horizontal-bar-track">
                  <div
                    className="horizontal-bar-fill"
                    style={{
                      animationDelay: `${index * 35}ms`,
                      width: maxValue > 0 ? `${Math.max(2, (item.value / maxValue) * 100)}%` : "0%",
                    }}
                  />
                  <span className="horizontal-bar-name"><strong>{index + 1}.</strong> {item.name}</span>
                  <span className="horizontal-bar-value">{formatValue(item.value)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="horizontal-chart-axis"><span>0</span><span>{formatAxisValue(maxValue)}</span></div>
        </div>
      ) : <EmptyState title="Chưa có dữ liệu trong khoảng thời gian này" />}
    </div>
  );
}

function RevenueChart({ data, preset }: { data: RevenueChartPoint[]; preset: TimePreset }) {
  const maxValue = Math.max(...data.map((point) => point.value), 0);
  const axisMax = revenueAxisMax(maxValue);
  const axisTicks = Array.from({ length: 5 }, (_, index) => axisMax * (1 - index / 4));
  const periodLabel = timePresets.find((item) => item.value === preset)?.label ?? "";

  return (
    <section className="revenue-chart-panel" key={preset}>
      <div className="panel-header">
        <div>
          <h2>Doanh thu theo thời gian</h2>
          <span>{periodLabel} · {preset === "today" ? "Theo giờ" : preset === "year" ? "Theo tháng" : "Theo ngày"}</span>
        </div>
        <strong className="revenue-chart-total">{money(data.reduce((sum, point) => sum + point.value, 0))}</strong>
      </div>
      <div className="revenue-chart-body">
        <div className="revenue-y-axis" aria-label="Trục doanh thu">
          {axisTicks.map((value, index) => <span key={index}>{compactMoney(value)}</span>)}
        </div>
        <div className="revenue-chart-scroll">
          <div className="revenue-chart" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(22px, 1fr))`, minWidth: `${Math.max(640, data.length * 34)}px` }}>
            {data.map((point) => {
              const height = axisMax > 0 && point.value > 0 ? Math.max(3, (point.value / axisMax) * 100) : 0;
              return (
                <div className="revenue-bar-item" key={point.key} aria-label={`${point.fullLabel}: ${money(point.value)}`} title={`${point.fullLabel}: ${money(point.value)}`}>
                  <div className="revenue-bar-track">
                    <div className={`revenue-bar${point.value === 0 ? " empty" : ""}`} style={{ height: point.value === 0 ? "2px" : `${height}%` }}>
                      <span className="revenue-bar-tooltip">{money(point.value)}</span>
                    </div>
                  </div>
                  <span className="revenue-bar-label">{point.showLabel ? point.label : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
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
