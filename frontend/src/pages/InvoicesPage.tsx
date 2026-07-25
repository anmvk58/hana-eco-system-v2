import { Eye, LoaderCircle, Search, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import type { Invoice, InvoiceStatus } from "../types";
import { dateTime, money, todayInputValue } from "../utils/format";

export function InvoicesPage() {
  const { hasPermission } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [fromDate, setFromDate] = useState(todayInputValue());
  const [toDate, setToDate] = useState(todayInputValue());
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState("");

  async function loadInvoices() {
    setLoading(true);
    setError("");
    try {
      const data = await api.invoices.list({
          status: status || undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        });
      setInvoices(data);
      setRefreshVersion((version) => version + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được hóa đơn");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvoices();
  }, []);

  async function cancel(invoice: Invoice) {
    const reason = window.prompt(`Lý do hủy hóa đơn ${invoice.code}`, "Khách hủy đơn");
    if (reason === null) return;
    if (!reason.trim()) { setError("Vui lòng nhập lý do hủy hóa đơn"); return; }
    try { await api.invoices.cancel(invoice.id, reason.trim()); await loadInvoices(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không hủy được hóa đơn"); }
  }

  return (
    <div className="page-stack">
      <section className="toolbar">
        <select value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus | "")}>
          <option value="">Tất cả trạng thái</option>
          <option value="created">Đã tạo</option>
          <option value="cancelled">Đã hủy</option>
        </select>
        <DateRangePicker from={fromDate} to={toDate} onChange={(from, to) => { setFromDate(from); setToDate(to); }} />
        <button className="secondary-button" type="button" disabled={loading} onClick={() => void loadInvoices()}>
          {loading ? <LoaderCircle className="loading-spinner" size={17} /> : <Search size={17} />}
          {loading ? "Đang lọc..." : "Lọc hóa đơn"}
        </button>
        {hasPermission("invoices.create") ? <Link className="primary-button link-button" to="/invoices/new">
          Tạo hóa đơn
        </Link> : null}
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="table-panel invoice-table-refresh" key={refreshVersion}>
        <table className="data-table invoice-list-table">
          <thead>
            <tr>
              <th>Mã hóa đơn</th>
              <th>Ngày bán</th>
              <th>Khách hàng</th>
              <th>Địa chỉ</th>
              <th>Trạng thái</th>
              <th className="numeric">Tiền hàng</th>
              <th className="numeric">Thu khác</th>
              <th className="numeric">Tổng thanh toán</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="code-cell">{invoice.code}</td>
                <td>{dateTime(invoice.sold_at)}</td>
                <td>{invoice.customer?.name ?? "Khách lẻ"}</td>
                <td>{invoice.customer?.address || "-"}</td>
                <td>
                  <StatusBadge status={invoice.status} />
                </td>
                <td className="numeric">{money(invoice.subtotal)}</td>
                <td className="numeric">{money(invoice.total_extra_charges)}</td>
                <td className="numeric strong">{money(invoice.total_amount)}</td>
                <td className="row-actions">
                  <Link className="icon-button" to={`/invoices/${invoice.id}`} aria-label="Xem">
                    <Eye size={16} />
                  </Link>
                  {hasPermission("invoices.cancel") && invoice.status === "created" ? <button className="icon-button danger" type="button" onClick={() => void cancel(invoice)} aria-label="Hủy hóa đơn">
                    <XCircle size={16} />
                  </button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 ? <EmptyState title="Chưa có hóa đơn" description="Tạo hóa đơn bán hàng để xem dữ liệu tại đây." /> : null}
      </section>
    </div>
  );
}

