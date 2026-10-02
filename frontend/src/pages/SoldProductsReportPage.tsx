import { ExternalLink, PackageSearch, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import type { SoldProductReportRow } from "../types";
import { money, numberText, todayInputValue } from "../utils/format";

export function SoldProductsReportPage() {
  const { hasPermission } = useAuth();
  const [appliedRange, setAppliedRange] = useState({ from: todayInputValue(), to: todayInputValue() });
  const [fromDate, setFromDate] = useState(todayInputValue());
  const [toDate, setToDate] = useState(todayInputValue());
  const [rows, setRows] = useState<SoldProductReportRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadReport() {
    if (fromDate && toDate && fromDate > toDate) {
      setError("Từ ngày không được lớn hơn đến ngày");
      return;
    }
    setLoading(true); setError("");
    const range = { from: fromDate, to: toDate };
    try {
      setRows(await api.reports.soldProducts({ from_date: range.from || undefined, to_date: range.to || undefined }));
      setAppliedRange(range);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được báo cáo hàng hóa bán được");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadReport(); }, []);

  function invoiceUrl(row: SoldProductReportRow) {
    const params = new URLSearchParams({ product_code: row.product_code, product_name: row.product_name, status: "active", from_date: appliedRange.from, to_date: appliedRange.to });
    return `/invoices?${params.toString()}`;
  }

  const filteredRows = useMemo(() => {
    const keyword = filter.trim().toLocaleLowerCase("vi");
    if (!keyword) return rows;
    return rows.filter((row) => [row.product_code, row.product_name, row.unit]
      .some((value) => value.toLocaleLowerCase("vi").includes(keyword)));
  }, [filter, rows]);

  const totals = useMemo(() => filteredRows.reduce((sum, row) => ({
    quantity: sum.quantity + Number(row.quantity_sold),
    revenue: sum.revenue + Number(row.sales_revenue),
  }), { quantity: 0, revenue: 0 }), [filteredRows]);

  return <div className="page-stack">
    <section className="toolbar">
      <DateRangePicker from={fromDate} to={toDate} onChange={(from, to) => { setFromDate(from); setToDate(to); }} />
      <button className="secondary-button" type="button" disabled={loading} onClick={() => void loadReport()}>
        <Search size={17}/>{loading ? "Đang tải..." : "Xem báo cáo"}
      </button>
    </section>
    {error ? <div className="alert error">{error}</div> : null}
    <section className="table-panel">
      <div className="panel-header"><div><h2>Hàng hóa bán được</h2><span>{filteredRows.length}{filter.trim() ? ` / ${rows.length}` : ""} sản phẩm trong khoảng thời gian đã chọn</span></div><PackageSearch size={22}/></div>
      <div className="sold-products-filter"><Search size={17}/><input aria-label="Lọc nhanh sản phẩm" placeholder="Lọc theo mã, tên hoặc đơn vị..." value={filter} onChange={(event) => setFilter(event.target.value)}/></div>
      <p className="sold-products-drilldown-hint">Ngày bán: {appliedRange.from || "Không giới hạn"} → {appliedRange.to || "Không giới hạn"}. {hasPermission("invoices.view") ? "Bấm tên sản phẩm để xem hóa đơn trong tab mới (không gồm hóa đơn đã hủy)." : "Bạn cần quyền xem hóa đơn để mở danh sách hóa đơn theo sản phẩm."}</p>
      <table className="data-table">
        <thead><tr><th>Mã SP</th><th>Tên SP</th><th>Đơn vị tính</th><th className="numeric">SL bán được</th><th className="numeric">Doanh thu bán được</th></tr></thead>
        <tbody>
          {filteredRows.map(row => <tr key={row.product_code}><td>{row.product_code}</td><td className="code-cell">{hasPermission("invoices.view") ? <Link className="sold-product-invoice-link" to={invoiceUrl(row)} target="_blank" rel="noopener noreferrer" title={`Xem hóa đơn có ${row.product_name} trong tab mới`}>{row.product_name}<ExternalLink size={14} aria-hidden="true" /></Link> : row.product_name}</td><td>{row.unit}</td><td className="numeric">{numberText(row.quantity_sold, 3)}</td><td className="numeric strong">{money(row.sales_revenue)}</td></tr>)}
          {filteredRows.length ? <tr className="report-total-row"><td colSpan={3} className="strong">Tổng cộng</td><td className="numeric strong">{numberText(totals.quantity, 3)}</td><td className="numeric strong">{money(totals.revenue)}</td></tr> : null}
        </tbody>
      </table>
      {!loading && rows.length === 0 ? <EmptyState title="Chưa có hàng hóa bán được trong khoảng thời gian này"/> : null}
      {!loading && rows.length > 0 && filteredRows.length === 0 ? <EmptyState title="Không tìm thấy sản phẩm phù hợp" description="Hãy thử mã, tên hoặc đơn vị khác."/> : null}
    </section>
  </div>;
}
