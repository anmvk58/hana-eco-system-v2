import { BarChart3, CalendarDays, Check, ChevronDown, CircleDollarSign, ReceiptText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import type {
  DashboardCountSlice,
  DashboardCustomerSummary,
  DashboardOrderStatusCharts,
  DashboardProductMetric,
  DashboardProductSummary,
  DashboardSummary,
  DashboardTimePreset,
} from "../types";
import { money, numberText, todayInputValue } from "../utils/format";

type TimePreset = DashboardTimePreset;
type RankingTimePreset = Exclude<DashboardTimePreset, "custom">;

const timePresets: Array<{ value: TimePreset; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "last7days", label: "7 ngày qua" },
  { value: "thisMonth", label: "Tháng này" },
  { value: "custom", label: "Khoảng ngày" },
];

const rankingTimePresets: Array<{ value: RankingTimePreset; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "last7days", label: "7 ngày qua" },
  { value: "thisMonth", label: "Tháng này" },
];

const productMetricOptions: Array<{ value: DashboardProductMetric; label: string }> = [
  { value: "revenue", label: "Theo Doanh thu thuần" },
  { value: "quantity", label: "Theo Số lượng" },
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

function rankingDateRange(preset: RankingTimePreset, today: string) {
  if (preset === "yesterday") {
    const yesterday = previousDate(today);
    return { fromDate: yesterday, toDate: yesterday };
  }
  if (preset === "last7days") return { fromDate: shiftDate(today, -6), toDate: today };
  if (preset === "thisMonth") return { fromDate: `${today.slice(0, 8)}01`, toDate: today };
  return { fromDate: today, toDate: today };
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
  const [topProducts, setTopProducts] = useState<DashboardProductSummary[]>([]);
  const [topProductMetric, setTopProductMetric] = useState<DashboardProductMetric>("quantity");
  const [topProductTimePreset, setTopProductTimePreset] = useState<RankingTimePreset>("today");
  const [topProductsLoading, setTopProductsLoading] = useState(true);
  const [topProductsError, setTopProductsError] = useState("");
  const [topCustomers, setTopCustomers] = useState<DashboardCustomerSummary[]>([]);
  const [topCustomerTimePreset, setTopCustomerTimePreset] = useState<RankingTimePreset>("today");
  const [topCustomersLoading, setTopCustomersLoading] = useState(true);
  const [topCustomersError, setTopCustomersError] = useState("");
  const [orderStatusCharts, setOrderStatusCharts] = useState<DashboardOrderStatusCharts | null>(null);
  const [orderStatusTimePreset, setOrderStatusTimePreset] = useState<RankingTimePreset>("today");
  const [orderStatusLoading, setOrderStatusLoading] = useState(true);
  const [orderStatusError, setOrderStatusError] = useState("");
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

  useEffect(() => {
    let active = true;
    const range = rankingDateRange(topProductTimePreset, today);
    setTopProductsLoading(true);
    setTopProductsError("");
    void api.dashboard.topProducts(topProductMetric, range.fromDate, range.toDate)
      .then((data) => {
        if (active) setTopProducts(data);
      })
      .catch((err) => {
        if (!active) return;
        setTopProducts([]);
        setTopProductsError(err instanceof Error ? err.message : "Không tải được bảng xếp hạng hàng bán chạy");
      })
      .finally(() => {
        if (active) setTopProductsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [today, topProductMetric, topProductTimePreset]);

  useEffect(() => {
    let active = true;
    const range = rankingDateRange(topCustomerTimePreset, today);
    setTopCustomersLoading(true);
    setTopCustomersError("");
    void api.dashboard.topCustomers(range.fromDate, range.toDate)
      .then((data) => {
        if (active) setTopCustomers(data);
      })
      .catch((err) => {
        if (!active) return;
        setTopCustomers([]);
        setTopCustomersError(err instanceof Error ? err.message : "Không tải được bảng xếp hạng khách hàng");
      })
      .finally(() => {
        if (active) setTopCustomersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [today, topCustomerTimePreset]);

  useEffect(() => {
    let active = true;
    const range = rankingDateRange(orderStatusTimePreset, today);
    setOrderStatusLoading(true);
    setOrderStatusError("");
    void api.dashboard.orderStatusCharts(range.fromDate, range.toDate)
      .then((data) => {
        if (active) setOrderStatusCharts(data);
      })
      .catch((err) => {
        if (!active) return;
        setOrderStatusCharts(null);
        setOrderStatusError(err instanceof Error ? err.message : "Không tải được thống kê trạng thái đơn hàng");
      })
      .finally(() => {
        if (active) setOrderStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderStatusTimePreset, today]);

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

      <section className="dashboard-revenue-overview-panel" aria-busy={loading}>
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

        <div className="dashboard-revenue-overview-body">
          <div className={loading ? "dashboard-content loading" : "dashboard-content"} aria-busy={loading}>
            <section className="metric-grid dashboard-metrics dashboard-metrics-refresh" key={`${fromDate}-${toDate}`}>
              <MetricCard
                icon={<ReceiptText />}
                label="Doanh thu thuần sản phẩm"
                value={money(productRevenue)}
                detail={`${numberText(createdInvoiceCount)} hóa đơn`}
              />
              <MetricCard icon={<CircleDollarSign />} label="Tổng tiền thu khác" value={money(extraChargeRevenue)} />
            </section>

            <RevenueChart data={revenueChartData} granularity={summary?.revenue_granularity ?? "hour"} fromDate={fromDate} toDate={toDate} total={Number(productRevenue)} />
          </div>
        </div>
      </section>

      <section className="dashboard-top-charts">
        <HorizontalTopChart
          key={`${topProductMetric}-${topProductTimePreset}`}
          title="Top 10 hàng bán chạy"
          subtitle={topProductMetric === "revenue" ? "Xếp hạng theo doanh thu thuần" : "Xếp hạng theo số lượng bán"}
          data={topProducts.map((product) => ({
            key: product.key,
            name: product.name,
            value: Number(topProductMetric === "revenue" ? product.revenue : product.quantity),
          }))}
          valueType={topProductMetric}
          loading={topProductsLoading}
          error={topProductsError}
          controls={(
            <div className="dashboard-chart-filters">
              <DashboardSelect
                ariaLabel="Chọn thống kê"
                className="dashboard-chart-filter-metric"
                icon={<BarChart3 aria-hidden="true" size={16} />}
                options={productMetricOptions}
                value={topProductMetric}
                onChange={(value) => setTopProductMetric(value as DashboardProductMetric)}
              />
              <RankingTimeSelect value={topProductTimePreset} onChange={setTopProductTimePreset} />
            </div>
          )}
        />
        <HorizontalTopChart
          key={`customers-${topCustomerTimePreset}`}
          title="Top 10 khách hàng mua nhiều nhất"
          subtitle="Xếp hạng theo tổng doanh thu hóa đơn"
          data={topCustomers.map((customer) => ({ key: String(customer.customer_id), name: customer.name, value: Number(customer.revenue) }))}
          valueType="revenue"
          loading={topCustomersLoading}
          error={topCustomersError}
          controls={<RankingTimeSelect value={topCustomerTimePreset} onChange={setTopCustomerTimePreset} />}
        />
      </section>

      <section className="dashboard-order-charts-panel" aria-busy={orderStatusLoading}>
        <div className="panel-header dashboard-order-charts-header">
          <div>
            <h2>Thống kê trạng thái đơn hàng</h2>
            <span>Audit, phân bổ shipper nội bộ và tình trạng kiểm kê</span>
          </div>
          <RankingTimeSelect value={orderStatusTimePreset} onChange={setOrderStatusTimePreset} />
        </div>
        {orderStatusError ? <div className="alert error dashboard-chart-alert">{orderStatusError}</div> : orderStatusLoading ? (
          <EmptyState title="Đang tải thống kê trạng thái đơn hàng" />
        ) : (
          <section className="dashboard-pie-grid" key={orderStatusTimePreset}>
            <DonutChart title="Trạng thái Audit đơn" subtitle="Đơn đã gán nhãn và chưa gán nhãn" data={orderStatusCharts?.audit_chart ?? []} />
            <DonutChart
              title="Đơn theo shipper nội bộ"
              subtitle="Top 10 shipper có số đơn nhiều nhất"
              data={(orderStatusCharts?.internal_shipper_chart ?? []).map((shipper) => ({ key: String(shipper.shipper_id), label: shipper.name, value: shipper.order_count }))}
            />
            <DonutChart title="Trạng thái kiểm kê" subtitle="Đơn đã thu tiền và đang chờ kiểm kê" data={orderStatusCharts?.reconciliation_chart ?? []} />
          </section>
        )}
      </section>
    </div>
  );
}

function HorizontalTopChart({
  title,
  subtitle,
  data,
  valueType,
  controls,
  loading = false,
  error = "",
}: {
  title: string;
  subtitle: string;
  data: Array<{ key: string; name: string; value: number }>;
  valueType: "quantity" | "revenue";
  controls?: ReactNode;
  loading?: boolean;
  error?: string;
}) {
  const maxValue = Math.max(...data.map((item) => item.value), 0);
  const formatValue = (value: number) => valueType === "revenue" ? money(value) : numberText(value, 3);
  const formatAxisValue = (value: number) => valueType === "revenue" ? compactMoney(value) : numberText(value, 3);

  return (
    <div className="horizontal-chart-panel">
      <div className="panel-header dashboard-ranking-header">
        <div>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
        {controls}
      </div>
      {error ? <div className="alert error dashboard-chart-alert">{error}</div> : loading ? (
        <EmptyState title="Đang tải dữ liệu xếp hạng" />
      ) : data.length ? (
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

function RankingTimeSelect({
  value,
  onChange,
}: {
  value: RankingTimePreset;
  onChange: (value: RankingTimePreset) => void;
}) {
  return (
    <DashboardSelect
      ariaLabel="Bộ lọc thời gian"
      icon={<CalendarDays aria-hidden="true" size={16} />}
      options={rankingTimePresets}
      value={value}
      onChange={(selected) => onChange(selected as RankingTimePreset)}
    />
  );
}

function DashboardSelect({
  ariaLabel,
  className = "",
  icon,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  className?: string;
  icon: ReactNode;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`dashboard-chart-filter ${className}${open ? " open" : ""}`} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel}: ${selected.label}`}
        className="dashboard-chart-select-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        <strong>{selected.label}</strong>
        <ChevronDown aria-hidden="true" className="dashboard-chart-select-chevron" size={16} />
      </button>
      {open ? (
        <div aria-label={ariaLabel} className="dashboard-chart-select-menu" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={option.value === value ? "active" : ""}
              key={option.value}
              role="option"
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check aria-hidden="true" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}
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

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span className="dashboard-metric-label">{label}</span>
      <div className="dashboard-metric-value">
        <strong>{value}</strong>
        {detail ? <small className="dashboard-metric-detail">{detail}</small> : null}
      </div>
    </div>
  );
}
