import { CalendarDays, CircleDollarSign, ClipboardCheck, ReceiptText, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import type { DashboardCountSlice, DashboardSummary, DashboardTimePreset } from "../types";
import { money, numberText, todayInputValue } from "../utils/format";

type TimePreset = DashboardTimePreset;

const timePresets: Array<{ value: TimePreset; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "last7days", label: "7 ngày qua" },
  { value: "thisMonth", label: "Tháng này" },
  { value: "custom", label: "Khoảng ngày" },
];

const pieColors = ["#15947f", "#e7832e", "#376fd0", "#8d63c7", "#d7556b", "#49a4b6", "#a58b26", "#61717c", "#53a85a", "#c5689e"];

function previousDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day - 1));
  return result.toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

interface RevenueChartPoint {
  key: string;
  label: string;
  fullLabel: string;
  value: number;
  showLabel: boolean;
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
  const today = todayInputValue();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timePreset, setTimePreset] = useState<TimePreset>("today");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    let active = true;
    setError("");
    setLoading(true);
    void api.dashboard.summary(fromDate, toDate)
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Không tải được tổng quan");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fromDate, toDate]);

  function selectPreset(preset: TimePreset) {
    setTimePreset(preset);
    if (preset === "today") {
      setFromDate(today);
      setToDate(today);
    } else if (preset === "yesterday") {
      const yesterday = previousDate(today);
      setFromDate(yesterday);
      setToDate(yesterday);
    } else if (preset === "last7days") {
      setFromDate(shiftDate(today, -6));
      setToDate(today);
    } else if (preset === "thisMonth") {
      setFromDate(`${today.slice(0, 8)}01`);
      setToDate(today);
    }
  }

  function changeCustomRange(from: string, to: string) {
    setTimePreset("custom");
    setFromDate(from);
    setToDate(to);
  }

  const productRevenue = summary?.product_revenue ?? "0";
  const extraChargeRevenue = summary?.extra_charge_revenue ?? "0";
  const createdInvoiceCount = summary?.created_invoice_count ?? 0;
  const createdCustomerCount = summary?.created_customer_count ?? 0;
  const topProductsByQuantity = summary?.top_products_by_quantity ?? [];
  const topProductsByRevenue = summary?.top_products_by_revenue ?? [];
  const revenueChartData: RevenueChartPoint[] = (summary?.revenue_chart ?? []).map((point) => ({
    key: point.key,
    label: point.label,
    fullLabel: point.full_label,
    value: Number(point.value),
    showLabel: point.show_label,
  }));

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
              onClick={() => selectPreset(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {timePreset === "custom" ? (
          <DateRangePicker from={fromDate} to={toDate} onChange={changeCustomRange} />
        ) : null}
      </section>

      <div className={loading ? "dashboard-content loading" : "dashboard-content"} aria-busy={loading}>
      <section className="metric-grid dashboard-metrics dashboard-metrics-refresh" key={`${fromDate}-${toDate}`}>
        <MetricCard icon={<ReceiptText />} label="Doanh thu thuần sản phẩm" value={money(productRevenue)} />
        <MetricCard icon={<CircleDollarSign />} label="Tổng tiền thu khác" value={money(extraChargeRevenue)} />
        <MetricCard icon={<ClipboardCheck />} label="Hóa đơn đã tạo" value={String(createdInvoiceCount)} />
        <MetricCard icon={<Users />} label="Khách hàng đã tạo" value={String(createdCustomerCount)} />
      </section>

      <RevenueChart data={revenueChartData} granularity={summary?.revenue_granularity ?? "hour"} fromDate={fromDate} toDate={toDate} total={Number(productRevenue)} />

      <section className="dashboard-top-charts" key={`top-products-${fromDate}-${toDate}`}>
        <HorizontalTopChart
          title="Top 10 sản phẩm theo số lượng"
          subtitle="Sản phẩm bán được nhiều nhất"
          data={topProductsByQuantity.map((product) => ({ key: product.key, name: product.name, value: Number(product.quantity) }))}
          valueType="quantity"
        />
        <HorizontalTopChart
          title="Top 10 sản phẩm theo doanh thu"
          subtitle="Sản phẩm có doanh thu cao nhất"
          data={topProductsByRevenue.map((product) => ({ key: product.key, name: product.name, value: Number(product.revenue) }))}
          valueType="revenue"
        />
      </section>

      <section className="dashboard-pie-grid" key={`pie-${fromDate}-${toDate}`}>
        <DonutChart title="Trạng thái Audit đơn" subtitle="Đơn đã gán nhãn và chưa gán nhãn" data={summary?.audit_chart ?? []} />
        <DonutChart
          title="Đơn theo shipper nội bộ"
          subtitle="Top 10 shipper có số đơn nhiều nhất"
          data={(summary?.internal_shipper_chart ?? []).map((shipper) => ({ key: String(shipper.shipper_id), label: shipper.name, value: shipper.order_count }))}
        />
        <DonutChart title="Trạng thái kiểm kê" subtitle="Đơn đã thu tiền và đang chờ kiểm kê" data={summary?.reconciliation_chart ?? []} />
      </section>
      </div>
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

function RevenueChart({
  data,
  granularity,
  fromDate,
  toDate,
  total,
}: {
  data: RevenueChartPoint[];
  granularity: "hour" | "day" | "month";
  fromDate: string;
  toDate: string;
  total: number;
}) {
  const maxValue = Math.max(...data.map((point) => point.value), 0);
  const axisMax = revenueAxisMax(maxValue);
  const axisTicks = Array.from({ length: 5 }, (_, index) => axisMax * (1 - index / 4));
  const formatDate = (value: string) => new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00+07:00`));
  const rangeLabel = !fromDate || !toDate ? "Đang chọn khoảng ngày" : fromDate === toDate
    ? formatDate(fromDate)
    : `${formatDate(fromDate)} – ${formatDate(toDate)}`;
  const granularityLabel = granularity === "hour" ? "Theo giờ" : granularity === "month" ? "Theo tháng" : "Theo ngày";

  return (
    <section className="revenue-chart-panel" key={`${fromDate}-${toDate}`}>
      <div className="panel-header">
        <div>
          <h2>Doanh thu theo thời gian</h2>
          <span>{rangeLabel} · {granularityLabel}</span>
        </div>
        <strong className="revenue-chart-total">{money(total)}</strong>
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

function DonutChart({ title, subtitle, data }: { title: string; subtitle: string; data: DashboardCountSlice[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;

  return (
    <article className="dashboard-pie-panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
      </div>
      <div className="dashboard-pie-body">
        <div className="dashboard-donut" role="img" aria-label={`${title}: tổng ${numberText(total)} đơn`}>
          <svg viewBox="0 0 42 42" aria-hidden="true">
            <circle className="dashboard-donut-track" cx="21" cy="21" r="15.9155" pathLength="100" />
            {total > 0 ? data.map((item, index) => {
              const percentage = item.value / total * 100;
              const currentOffset = offset;
              offset += percentage;
              return (
                <circle
                  className="dashboard-donut-segment"
                  cx="21"
                  cy="21"
                  r="15.9155"
                  key={item.key}
                  pathLength="100"
                  stroke={pieColors[index % pieColors.length]}
                  strokeDasharray={`${percentage} ${100 - percentage}`}
                  strokeDashoffset={-currentOffset}
                />
              );
            }) : null}
          </svg>
          <div><strong>{numberText(total)}</strong><span>Tổng đơn</span></div>
        </div>
        {data.length ? (
          <div className="dashboard-pie-legend">
            {data.map((item, index) => (
              <div key={item.key} title={`${item.label}: ${numberText(item.value)} đơn`}>
                <i style={{ backgroundColor: pieColors[index % pieColors.length] }} />
                <span>{item.label}</span>
                <strong>{numberText(item.value)}</strong>
                <small>{total > 0 ? `${Math.round(item.value / total * 100)}%` : "0%"}</small>
              </div>
            ))}
          </div>
        ) : <EmptyState title="Không có đơn trong khoảng thời gian này" />}
      </div>
    </article>
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
