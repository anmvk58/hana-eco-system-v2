import { ArrowRight, Banknote, CalendarDays, CheckCircle2, CreditCard, History, LoaderCircle, PackageCheck, ReceiptText, RefreshCw, Truck, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { ToastNotification } from "../components/ToastNotification";
import type { InternalCodShipperSummary } from "../types";
import { money, numberText, todayInputValue, utcDateTime } from "../utils/format";

export function InternalCodCollectionsPage() {
  const today = todayInputValue();
  const [collectionDate, setCollectionDate] = useState(today);
  const [summaries, setSummaries] = useState<InternalCodShipperSummary[]>([]);
  const [collecting, setCollecting] = useState<InternalCodShipperSummary | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  async function load(selectedDate = collectionDate) {
    setLoading(true);
    setError("");
    try {
      const nextSummaries = await api.internalCodCollections.summary(selectedDate);
      setSummaries(nextSummaries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu thu tiền shipper nội bộ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(today); }, []);

  function changeCollectionDate(value: string) {
    if (!value) return;
    setCollectionDate(value);
    void load(value);
  }

  function openCollection(summary: InternalCodShipperSummary) {
    if (summary.pending_invoice_count === 0) return;
    setNote("");
    setError("");
    setCollecting(summary);
  }

  async function submitCollection(event: FormEvent) {
    event.preventDefault();
    if (!collecting) return;
    setSaving(true);
    setError("");
    try {
      const session = await api.internalCodCollections.createSession({
        shipper_id: collecting.shipper.id,
        collection_date: collectionDate,
        invoice_ids: collecting.pending_invoices.map((invoice) => invoice.id),
        note: note.trim() || undefined,
      });
      setCollecting(null);
      setNote("");
      setToast(`Đã tạo phiên ${session.code} và thu đủ ${money(session.total_amount)}.`);
      await load(collectionDate);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCollecting(null);
        await load(collectionDate);
      }
      setError(err instanceof Error ? err.message : "Không tạo được phiên thu tiền");
    } finally {
      setSaving(false);
    }
  }

  const outstandingShippers = summaries.filter((summary) => summary.pending_invoice_count > 0);
  const handedOverInvoiceCount = outstandingShippers.reduce((sum, summary) => sum + summary.handed_over_invoice_count, 0);
  const codInvoiceCount = outstandingShippers.reduce((sum, summary) => sum + summary.cod_invoice_count, 0);
  const pendingCodAmount = outstandingShippers.reduce((sum, summary) => sum + Number(summary.pending_cod_amount), 0);

  return <div className="page-stack internal-cod-page">
    <section className="internal-cod-hero">
      <div className="internal-cod-hero-copy"><span className="internal-cod-hero-icon"><WalletCards size={25}/></span><span><h2>Thu tiền Ship Nội Bộ</h2><p>Đối soát số đơn đã bàn giao và COD đang treo cho shipper theo từng ngày.</p></span></div>
      <div className="internal-cod-filter-card">
        <CalendarDays size={21}/>
        <label className="internal-cod-day-filter"><span>Chọn một ngày bàn giao</span><input type="date" value={collectionDate} max={today} onInput={(event) => changeCollectionDate(event.currentTarget.value)}/></label>
        <button className="icon-button" disabled={loading || saving} onClick={() => void load()} aria-label="Làm mới công nợ" title="Làm mới"><RefreshCw className={loading ? "loading-spinner" : ""} size={18}/></button>
      </div>
    </section>
    <div className="internal-cod-transfer-note"><CheckCircle2 size={18}/><span><strong>Công nợ phát sinh ngay khi bàn giao cho shipper.</strong> Đơn chuyển khoản không tính COD; đơn hủy hoặc đã xóa được loại khỏi công nợ.</span></div>
    {error ? <div className="alert error">{error}</div> : null}

    <section className="internal-cod-overview">
      <article><span className="detail-summary-icon"><Truck size={22}/></span><small>Shipper còn công nợ</small><strong>{outstandingShippers.length}</strong></article>
      <article><span className="detail-summary-icon"><PackageCheck size={22}/></span><small>Tổng đơn đã bàn giao</small><strong>{handedOverInvoiceCount} đơn</strong></article>
      <article><span className="detail-summary-icon"><ReceiptText size={22}/></span><small>Tổng đơn COD</small><strong>{codInvoiceCount} đơn</strong></article>
      <article className="highlight"><span className="detail-summary-icon"><Banknote size={22}/></span><small>Tổng tiền cần nộp</small><strong>{money(pendingCodAmount)}</strong></article>
    </section>

    <section className="internal-cod-debt-section">
      <header className="internal-cod-section-heading"><div><h2>Công nợ theo shipper trong ngày</h2><p>Chỉ hiển thị shipper còn tiền COD phải nộp trong ngày đã chọn.</p></div><div className="internal-cod-section-actions"><span>{outstandingShippers.length} shipper cần đối soát</span><Link className="secondary-button compact-button" to="/cod-management/internal-collection-history"><History size={16}/>Xem lịch sử<ArrowRight size={15}/></Link></div></header>
      <div className="internal-cod-debt-table-wrap">
        <table className="data-table internal-cod-debt-table">
          <thead><tr><th>Shipper</th><th className="numeric">Tổng đơn đã nhận</th><th className="numeric">Tổng đơn COD</th><th className="numeric">Chuyển khoản loại trừ</th><th className="numeric">COD chưa thu</th><th className="numeric">Tiền cần nộp</th><th></th></tr></thead>
          <tbody>{outstandingShippers.map((summary) => {
            const initial = summary.shipper.user.display_name.trim().charAt(0).toLocaleUpperCase("vi-VN");
            return <tr key={summary.shipper.id}>
              <td><div className="internal-cod-table-shipper"><span className="internal-cod-shipper-avatar">{initial}</span><span className="internal-cod-shipper-name"><strong>{summary.shipper.user.display_name}</strong><small>{summary.shipper.phone || summary.shipper.user.username}</small></span><span className={`status-badge ${summary.shipper.is_active ? "active" : "cancelled"}`}>{summary.shipper.is_active ? "Đang hoạt động" : "Đã ngừng"}</span></div></td>
              <td className="numeric"><strong>{summary.handed_over_invoice_count}</strong></td>
              <td className="numeric"><strong>{summary.cod_invoice_count}</strong></td>
              <td className="numeric">{summary.transfer_invoice_count > 0 ? <span className="internal-cod-transfer-count"><CreditCard size={14}/>{summary.transfer_invoice_count}</span> : <span className="muted-text">—</span>}</td>
              <td className="numeric"><span className="internal-cod-pending-count">{summary.pending_invoice_count} đơn</span></td>
              <td className="numeric"><strong className="internal-cod-table-amount">{money(summary.pending_cod_amount)}</strong></td>
              <td className="row-actions"><button className="primary-button compact-button" disabled={saving} onClick={() => openCollection(summary)}><Banknote size={16}/>Thu tiền</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="internal-cod-mobile-list">
        {outstandingShippers.map((summary) => {
          const initial = summary.shipper.user.display_name.trim().charAt(0).toLocaleUpperCase("vi-VN");
          return <article className="internal-cod-shipper-card" key={summary.shipper.id}>
            <header><span className="internal-cod-shipper-avatar">{initial}</span><span className="internal-cod-shipper-name"><strong>{summary.shipper.user.display_name}</strong><small>{summary.shipper.phone || summary.shipper.user.username}</small></span><span className={`status-badge ${summary.shipper.is_active ? "active" : "cancelled"}`}>{summary.shipper.is_active ? "Đang hoạt động" : "Đã ngừng"}</span></header>
            <div className="internal-cod-shipper-debt">
              <div className="internal-cod-shipper-amount"><span><Banknote size={18}/></span><small>Tổng tiền cần nộp</small><strong>{money(summary.pending_cod_amount)}</strong><em>{summary.pending_invoice_count} đơn COD chưa thu</em></div>
              <div className="internal-cod-shipper-order-stats">
                <div><PackageCheck size={16}/><span><small>Tổng đơn đã nhận</small><strong>{summary.handed_over_invoice_count} đơn</strong></span></div>
                <div><ReceiptText size={16}/><span><small>Tổng đơn COD</small><strong>{summary.cod_invoice_count} đơn</strong></span></div>
              </div>
              {summary.transfer_invoice_count > 0 ? <div className="internal-cod-transfer-exclusion"><CreditCard size={14}/>{summary.transfer_invoice_count} đơn chuyển khoản đã loại trừ</div> : null}
            </div>
            <footer><button className="primary-button" disabled={saving} onClick={() => openCollection(summary)}><Banknote size={17}/>Thu đủ {money(summary.pending_cod_amount)}</button></footer>
          </article>;
        })}
      </div>
      {!loading && outstandingShippers.length === 0 ? <EmptyState title="Không có công nợ COD trong ngày" description="Không có shipper nào đang giữ COD của ngày đã chọn."/> : null}
      {loading && outstandingShippers.length === 0 ? <EmptyState title="Đang tải công nợ"/> : null}
    </section>

    {collecting ? <Modal title={`Thu COD từ ${collecting.shipper.user.display_name}`} className="internal-cod-collection-modal" onClose={() => !saving && setCollecting(null)}>
      <form className="page-stack internal-cod-collection-form" onSubmit={(event) => void submitCollection(event)}>
        <section className="internal-cod-modal-summary"><article><small>Ngày bàn giao</small><strong>{new Date(`${collectionDate}T00:00:00`).toLocaleDateString("vi-VN")}</strong></article><article><small>Tổng số đơn</small><strong>{collecting.handed_over_invoice_count} đơn</strong></article><article><small>Đơn COD chờ thu</small><strong>{collecting.pending_invoice_count} đơn</strong></article><article className="highlight"><small>Số tiền phải nộp đủ</small><strong>{money(collecting.pending_cod_amount)}</strong></article></section>
        <div className="internal-cod-invoice-list"><div className="internal-cod-invoice-list-heading"><span><strong>Toàn bộ đơn đã bàn giao</strong><small>{collecting.handed_over_invoice_count} đơn trong ngày</small></span><span><em className="payment-chip cash"><Banknote size={14}/>Thu COD</em><em className="payment-chip transfer"><CreditCard size={14}/>Đã chuyển khoản</em></span></div><table className="data-table"><thead><tr><th>Mã hóa đơn</th><th>Khách hàng</th><th>Bàn giao lúc</th><th>Hình thức thu tiền</th><th className="numeric">COD cần thu</th></tr></thead><tbody>{collecting.handed_over_invoices.map((invoice) => <tr className={invoice.is_paid_by_transfer ? "transfer" : invoice.is_cod_pending ? "cod-pending" : "cod-collected"} key={invoice.id}><td className="code-cell">{invoice.code}</td><td>{invoice.customer_name || "Khách lẻ"}</td><td>{invoice.handed_over_at ? utcDateTime(invoice.handed_over_at) : "—"}</td><td>{invoice.is_paid_by_transfer ? <span className="payment-chip transfer"><CreditCard size={14}/>Đã chuyển khoản</span> : invoice.is_cod_pending ? <span className="payment-chip cash"><Banknote size={14}/>Thu COD</span> : <span className="status-badge active"><CheckCircle2 size={14}/>Đã thu COD</span>}</td><td className="numeric strong">{invoice.is_paid_by_transfer ? <span className="internal-cod-no-collection">Không thu</span> : invoice.is_cod_pending ? numberText(invoice.total_amount) : <span className="internal-cod-already-collected">Đã thu</span>}</td></tr>)}</tbody></table><div className="internal-cod-invoice-mobile-list">{collecting.handed_over_invoices.map((invoice) => <article className={invoice.is_paid_by_transfer ? "transfer" : invoice.is_cod_pending ? "cod-pending" : "cod-collected"} key={invoice.id}><header><strong>{invoice.code}</strong>{invoice.is_paid_by_transfer ? <span className="payment-chip transfer"><CreditCard size={14}/>Đã chuyển khoản</span> : invoice.is_cod_pending ? <span className="payment-chip cash"><Banknote size={14}/>Thu COD</span> : <span className="status-badge active"><CheckCircle2 size={14}/>Đã thu COD</span>}</header><div><span><b>{invoice.customer_name || "Khách lẻ"}</b><small>{invoice.handed_over_at ? `Bàn giao ${utcDateTime(invoice.handed_over_at)}` : "Chưa có giờ bàn giao"}</small></span><strong className={invoice.is_paid_by_transfer ? "internal-cod-no-collection" : ""}>{invoice.is_paid_by_transfer ? "Không thu" : invoice.is_cod_pending ? money(invoice.total_amount) : "Đã thu"}</strong></div></article>)}</div></div>
        <label>Ghi chú thu tiền<textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: Shipper đã nộp đủ tiền mặt"/></label>
        <div className="internal-cod-confirmation"><CheckCircle2 size={19}/><span>Khi xác nhận, chỉ {collecting.pending_invoice_count} đơn có nhãn <strong>Thu COD</strong> được đánh dấu đã thu. Đơn <strong>Đã chuyển khoản</strong> không tính vào tiền shipper phải nộp.</span></div>
        <div className="form-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => setCollecting(null)}>Hủy</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="loading-spinner" size={17}/> : <Banknote size={17}/>}Xác nhận đã thu đủ</button></div>
      </form>
    </Modal> : null}

    {toast ? <ToastNotification title="Thu tiền thành công" message={toast} variant="success" duration={4200} onClose={() => setToast(null)}/> : null}
  </div>;
}
