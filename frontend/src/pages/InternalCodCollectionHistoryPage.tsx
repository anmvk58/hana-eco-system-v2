import { Banknote, Eye, History, PackageCheck, ReceiptText, RefreshCw, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import type { InternalCodCollectionSession } from "../types";
import { money, numberText, todayInputValue, utcDateTime } from "../utils/format";

export function InternalCodCollectionHistoryPage() {
  const today = todayInputValue();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<InternalCodCollectionSession[]>([]);
  const [viewing, setViewing] = useState<InternalCodCollectionSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(historyFrom = fromDate, historyTo = toDate) {
    setLoading(true);
    setError("");
    try {
      setSessions(await api.internalCodCollections.sessions(historyFrom, historyTo));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được lịch sử thu tiền COD");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(today, today); }, []);

  function changeDateRange(from: string, to: string) {
    setFromDate(from);
    setToDate(to);
    if ((from && to) || (!from && !to)) void load(from, to);
  }

  async function openSession(session: InternalCodCollectionSession) {
    setError("");
    try {
      setViewing(await api.internalCodCollections.session(session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được chi tiết phiên thu tiền");
    }
  }

  const filteredSessions = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi-VN");
    if (!keyword) return sessions;
    return sessions.filter((session) => [
      session.code,
      session.shipper_name,
      session.collected_by_name,
      session.note,
    ].some((value) => value?.toLocaleLowerCase("vi-VN").includes(keyword)));
  }, [search, sessions]);

  const totalInvoices = filteredSessions.reduce((sum, session) => sum + session.invoice_count, 0);
  const totalAmount = filteredSessions.reduce((sum, session) => sum + Number(session.total_amount), 0);
  const shipperCount = new Set(filteredSessions.map((session) => session.shipper_id)).size;

  return <div className="page-stack internal-cod-page internal-cod-history-page">
    <section className="internal-cod-hero internal-cod-history-hero">
      <div className="internal-cod-hero-copy"><span className="internal-cod-hero-icon"><History size={25}/></span><span><h2>Lịch sử thu tiền COD</h2><p>Tra cứu đầy đủ các phiên đã thu tiền từ shipper nội bộ.</p></span></div>
      <div className="internal-cod-history-filter">
        <DateRangePicker from={fromDate} to={toDate} onChange={changeDateRange}/>
        <button className="icon-button" disabled={loading} onClick={() => void load()} aria-label="Làm mới lịch sử" title="Làm mới"><RefreshCw className={loading ? "loading-spinner" : ""} size={18}/></button>
      </div>
    </section>
    {error ? <div className="alert error">{error}</div> : null}

    <section className="internal-cod-overview internal-cod-history-overview">
      <article><span className="detail-summary-icon"><ReceiptText size={22}/></span><small>Số phiên thu tiền</small><strong>{filteredSessions.length} phiên</strong></article>
      <article><span className="detail-summary-icon"><PackageCheck size={22}/></span><small>Tổng đơn đã thu</small><strong>{totalInvoices} đơn</strong></article>
      <article><span className="detail-summary-icon"><Users size={22}/></span><small>Số shipper đã nộp</small><strong>{shipperCount} shipper</strong></article>
      <article className="highlight"><span className="detail-summary-icon"><Banknote size={22}/></span><small>Tổng COD đã thu</small><strong>{money(totalAmount)}</strong></article>
    </section>

    <section className="table-panel internal-cod-history-panel">
      <header className="panel-heading internal-cod-history-heading">
        <div><h2>Danh sách phiên thu tiền</h2><p>Mỗi hóa đơn chỉ xuất hiện trong một phiên thu tiền.</p></div>
        <label className="internal-cod-history-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã phiên, shipper, người thu..."/><span>{filteredSessions.length} kết quả</span></label>
      </header>
      <div className="internal-cod-history-table-wrap">
        <table className="data-table"><thead><tr><th>Mã phiên</th><th>Thời điểm thu</th><th>Shipper</th><th>Người thu</th><th className="numeric">Số đơn</th><th className="numeric">Tổng tiền</th><th>Ghi chú</th><th></th></tr></thead>
          <tbody>{filteredSessions.map((session) => <tr key={session.id}><td className="code-cell">{session.code}</td><td>{utcDateTime(session.collected_at)}</td><td><strong>{session.shipper_name}</strong></td><td>{session.collected_by_name || "—"}</td><td className="numeric">{session.invoice_count}</td><td className="numeric strong internal-cod-amount">{numberText(session.total_amount)}</td><td className="internal-cod-history-note">{session.note || "—"}</td><td className="row-actions"><button className="icon-button" onClick={() => void openSession(session)} aria-label={`Xem ${session.code}`} title="Xem chi tiết"><Eye size={16}/></button></td></tr>)}</tbody>
        </table>
      </div>
      {!loading && sessions.length === 0 ? <EmptyState title="Chưa có phiên thu tiền" description="Không có phiên thu tiền trong khoảng ngày đã chọn."/> : null}
      {!loading && sessions.length > 0 && filteredSessions.length === 0 ? <EmptyState title="Không tìm thấy phiên phù hợp" description="Hãy thử từ khóa khác hoặc thay đổi khoảng ngày."/> : null}
      {loading && sessions.length === 0 ? <EmptyState title="Đang tải lịch sử thu tiền"/> : null}
    </section>

    {viewing ? <Modal title={`Chi tiết phiên ${viewing.code}`} className="internal-cod-collection-modal" onClose={() => setViewing(null)}>
      <div className="page-stack internal-cod-session-detail">
        <div className="external-batch-detail-meta"><span>Shipper <strong>{viewing.shipper_name}</strong></span><span>Thu lúc <strong>{utcDateTime(viewing.collected_at)}</strong></span><span>Người thu <strong>{viewing.collected_by_name || "Không rõ"}</strong></span></div>
        <section className="internal-cod-modal-summary"><article><small>Số đơn đã thu</small><strong>{viewing.invoice_count} đơn</strong></article><article className="highlight"><small>Tổng COD đã thu</small><strong>{money(viewing.total_amount)}</strong></article></section>
        <div className="internal-cod-invoice-list"><table className="data-table"><thead><tr><th>Mã hóa đơn</th><th>Khách hàng</th><th>Bàn giao lúc</th><th className="numeric">COD đã thu</th></tr></thead><tbody>{viewing.items.map((item) => <tr key={item.id}><td className="code-cell">{item.invoice_code}</td><td>{item.customer_name || "Khách lẻ"}</td><td>{item.handed_over_at ? utcDateTime(item.handed_over_at) : "—"}</td><td className="numeric strong">{numberText(item.cod_amount)}</td></tr>)}</tbody></table></div>
        {viewing.note ? <div className="internal-cod-session-note"><strong>Ghi chú:</strong> {viewing.note}</div> : null}
        <div className="form-actions"><button className="secondary-button" onClick={() => setViewing(null)}>Đóng</button></div>
      </div>
    </Modal> : null}
  </div>;
}
