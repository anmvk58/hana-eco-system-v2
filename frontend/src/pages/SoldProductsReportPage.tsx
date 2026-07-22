import { PackageSearch, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import type { SoldProductReportRow } from "../types";
import { firstDayOfCurrentMonthInputValue, money, numberText, todayInputValue } from "../utils/format";

export function SoldProductsReportPage() {
  const [fromDate, setFromDate] = useState(firstDayOfCurrentMonthInputValue());
  const [toDate, setToDate] = useState(todayInputValue());
  const [rows, setRows] = useState<SoldProductReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadReport() {
    if (fromDate && toDate && fromDate > toDate) {
      setError("Từ ngày không được lớn hơn đến ngày");
      return;
    }
    setLoading(true); setError("");
    try {
      setRows(await api.reports.soldProducts({ from_date: fromDate || undefined, to_date: toDate || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được báo cáo hàng hóa bán được");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadReport(); }, []);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    quantity: sum.quantity + Number(row.quantity_sold),
    revenue: sum.revenue + Number(row.sales_revenue),
  }), { quantity: 0, revenue: 0 }), [rows]);

  return <div className="page-stack">
    <section className="toolbar">
      <DateRangePicker from={fromDate} to={toDate} onChange={(from, to) => { setFromDate(from); setToDate(to); }} />
      <button className="secondary-button" type="button" disabled={loading} onClick={() => void loadReport()}>
        <Search size={17}/>{loading ? "Đang tải..." : "Xem báo cáo"}
      </button>
    </section>
    {error ? <div className="alert error">{error}</div> : null}
    <section className="table-panel">
      <div className="panel-header"><div><h2>Hàng hóa bán được</h2><span>{rows.length} sản phẩm trong khoảng thời gian đã chọn</span></div><PackageSearch size={22}/></div>
      <table className="data-table">
        <thead><tr><th>Mã SP</th><th>Tên SP</th><th>Đơn vị tính</th><th className="numeric">SL bán được</th><th className="numeric">Doanh thu bán được</th></tr></thead>
        <tbody>
          {rows.map(row => <tr key={row.product_code}><td className="code-cell">{row.product_code}</td><td>{row.product_name}</td><td>{row.unit}</td><td className="numeric">{numberText(row.quantity_sold, 3)}</td><td className="numeric strong">{money(row.sales_revenue)}</td></tr>)}
          {rows.length ? <tr className="report-total-row"><td colSpan={3} className="strong">Tổng cộng</td><td className="numeric strong">{numberText(totals.quantity, 3)}</td><td className="numeric strong">{money(totals.revenue)}</td></tr> : null}
        </tbody>
      </table>
      {!loading && rows.length === 0 ? <EmptyState title="Chưa có hàng hóa bán được trong khoảng thời gian này"/> : null}
    </section>
  </div>;
}
