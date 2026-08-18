import { Banknote, Boxes, CheckCircle2, Edit2, Eye, HandCoins, LoaderCircle, RefreshCw, RotateCcw, Search, Truck, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { ToastNotification } from "../components/ToastNotification";
import type { ExternalAdvanceMethod, ExternalHandoverBatch, Invoice } from "../types";
import { formatNumberInput, money, normalizeInvoiceCodeSearch, normalizeNumberInput, numberText, todayInputValue, utcDateTime } from "../utils/format";

export function ExternalHandoverBatchesPage() {
  const today = todayInputValue();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [batches, setBatches] = useState<ExternalHandoverBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingInvoice, setAddingInvoice] = useState(false);
  const [editing, setEditing] = useState<ExternalHandoverBatch | null>(null);
  const [viewing, setViewing] = useState<ExternalHandoverBatch | null>(null);
  const [availableInvoices, setAvailableInvoices] = useState<Invoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [invoiceCode, setInvoiceCode] = useState("");
  const [invoiceCodeError, setInvoiceCodeError] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<ExternalAdvanceMethod>("transfer");
  const [shippingFee, setShippingFee] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  async function load(from = fromDate, to = toDate) {
    setLoading(true);
    setError("");
    try {
      setBatches(await api.shipManagement.externalBatches(from, to));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách bảng kê");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(fromDate, toDate); }, []);

  function changeDateRange(selectedFromDate: string, selectedToDate: string) {
    setFromDate(selectedFromDate);
    setToDate(selectedToDate);
    const rangeIsComplete = Boolean(selectedFromDate && selectedToDate);
    const rangeWasCleared = !selectedFromDate && !selectedToDate;
    if (rangeIsComplete || rangeWasCleared) void load(selectedFromDate, selectedToDate);
  }

  async function openEdit(batch: ExternalHandoverBatch) {
    setError("");
    if (batch.is_reconciled) {
      setError("Bảng kê đã kiểm kê và nhận tiền, không thể chỉnh sửa");
      return;
    }
    try {
      const detail = await api.shipManagement.externalBatch(batch.id);
      if (detail.is_reconciled) {
        setError("Bảng kê đã kiểm kê và nhận tiền, không thể chỉnh sửa");
        await load();
        return;
      }
      const currentInvoices = detail.items.filter((item) => item.is_active).map((item) => item.invoice);
      setEditing(detail);
      setAvailableInvoices(currentInvoices);
      setSelectedIds(currentInvoices.map((invoice) => invoice.id));
      setAdvanceMethod(detail.advance_method);
      setShippingFee(String(detail.shipping_fee));
      setTransferAmount(String(detail.transfer_amount));
      setCashAmount(String(detail.cash_amount));
      setInvoiceCode("");
      setInvoiceCodeError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được bảng kê");
    }
  }

  async function addInvoiceByCode() {
    const normalizedCode = normalizeInvoiceCodeSearch(invoiceCode).toUpperCase();
    setInvoiceCode(normalizedCode);
    if (!normalizedCode) {
      setInvoiceCodeError("Vui lòng nhập mã hóa đơn");
      return;
    }
    const knownInvoice = availableInvoices.find((invoice) => invoice.code.toUpperCase() === normalizedCode);
    if (knownInvoice && selectedIds.includes(knownInvoice.id)) {
      setInvoiceCodeError("Hóa đơn đã nằm trong bảng kê");
      return;
    }
    if (knownInvoice) {
      setSelectedIds((ids) => [...ids, knownInvoice.id]);
      setInvoiceCode("");
      setInvoiceCodeError("");
      return;
    }
    setAddingInvoice(true);
    setInvoiceCodeError("");
    try {
      const invoice = await api.shipManagement.unauditedInvoiceByCode(normalizedCode);
      setAvailableInvoices((items) => [...items, invoice]);
      setSelectedIds((ids) => [...ids, invoice.id]);
      setInvoiceCode("");
    } catch (err) {
      setInvoiceCodeError(err instanceof Error ? err.message : "Không thêm được hóa đơn");
    } finally {
      setAddingInvoice(false);
    }
  }

  function removeInvoice(invoiceId: number) {
    setSelectedIds((ids) => ids.filter((id) => id !== invoiceId));
  }

  async function openView(batch: ExternalHandoverBatch) {
    setError("");
    try {
      setViewing(await api.shipManagement.externalBatch(batch.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được chi tiết bảng kê");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editing || selectedIds.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await api.shipManagement.updateExternalBatch(editing.id, {
        invoice_ids: selectedIds,
        external_handoff: {
          advance_method: advanceMethod,
          shipping_fee: String(Number(shippingFee || 0)),
          transfer_amount: advanceMethod === "cash" ? "0" : String(Number(transferAmount || 0)),
          cash_amount: advanceMethod === "transfer" ? "0" : String(Number(cashAmount || 0)),
        },
      });
      setEditing(null);
      setToast("Đã cập nhật bảng kê bàn giao");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được bảng kê");
    } finally {
      setSaving(false);
    }
  }

  async function cancelBatch(batch: ExternalHandoverBatch) {
    if (batch.is_reconciled) {
      setError("Bảng kê đã kiểm kê và nhận tiền, không thể hủy");
      return;
    }
    if (!window.confirm(`Hủy bàn giao ${batch.code}? Toàn bộ đơn trong bảng kê sẽ trở lại danh sách chưa audit.`)) return;
    setSaving(true);
    setError("");
    try {
      await api.shipManagement.cancelExternalBatch(batch.id);
      setToast(`Đã hủy bàn giao ${batch.code}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không hủy được bảng kê");
    } finally {
      setSaving(false);
    }
  }

  const selectedInvoices = availableInvoices.filter((invoice) => selectedIds.includes(invoice.id));
  const selectedGoodsTotal = selectedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0);
  const codTotal = selectedInvoices.reduce((sum, invoice) => sum + (invoice.is_paid_by_transfer ? 0 : Number(invoice.total_amount)), 0);
  const calculatedAdvance = codTotal - Number(shippingFee || 0);
  const viewingSummaryItems = viewing
    ? (viewing.items.some((item) => item.is_active) ? viewing.items.filter((item) => item.is_active) : viewing.items)
    : [];
  const viewingGoodsTotal = viewingSummaryItems.reduce((sum, item) => sum + Number(item.invoice.total_amount), 0);
  const viewingActualAdvance = viewing ? Number(viewing.transfer_amount) + Number(viewing.cash_amount) : 0;

  function changeShippingFee(value: string) {
    const normalized = normalizeNumberInput(value, false);
    setShippingFee(normalized);
    if (advanceMethod === "transfer") setTransferAmount(String(codTotal - Number(normalized || 0)));
  }

  function changeMethod(method: ExternalAdvanceMethod) {
    setAdvanceMethod(method);
    if (method === "transfer") setTransferAmount(String(calculatedAdvance));
  }

  return <div className="page-stack shipping-claim-page external-batches-page">
    <section className="toolbar shipping-toolbar">
      <div className="shipping-toolbar-copy"><h2 className="toolbar-title"><Truck size={20}/>Bảng kê Ship Ngoài</h2><span className="field-hint">Xem và điều chỉnh các phiên đã bàn giao cho ship ngoài.</span></div>
      <span className="toolbar-spacer"/>
      <DateRangePicker from={fromDate} to={toDate} onChange={changeDateRange}/>
      <button className="secondary-button" disabled={loading || saving} onClick={() => void load()}><RefreshCw size={17}/>Làm mới</button>
    </section>
    {error ? <div className="alert error">{error}</div> : null}
    <section className="table-panel">
      <table className="data-table"><thead><tr><th>Mã bảng kê</th><th>Thời điểm bàn giao</th><th>Người bàn giao</th><th>Số đơn</th><th>Hình thức ứng</th><th className="numeric">Tiền ship ứng</th><th className="numeric">Tiền ứng thực tế</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{batches.map((batch) => {
          const activeCount = batch.items.filter((item) => item.is_active).length;
          const actual = Number(batch.transfer_amount) + Number(batch.cash_amount);
          return <tr key={batch.id}>
            <td className="code-cell">{batch.code}</td><td>{utcDateTime(batch.handed_over_at)}</td><td>{batch.created_by_name || "—"}</td><td>{activeCount}</td>
            <td>{batch.advance_method === "transfer" ? "Chuyển khoản" : batch.advance_method === "cash" ? "Tiền mặt" : "Kết hợp"}</td>
            <td className="numeric">{numberText(batch.advance_amount)}</td><td className="numeric">{numberText(actual)}</td>
            <td>{batch.is_reconciled ? <span className="status-badge active"><CheckCircle2 size={14}/>Đã kiểm kê</span> : <span className={`status-badge ${batch.status}`}>{batch.status === "active" ? "Đang hiệu lực" : "Đã hủy"}</span>}</td>
            <td className="row-actions"><button className="icon-button" onClick={() => void openView(batch)} aria-label={`Xem ${batch.code}`}><Eye size={16}/></button>{batch.status === "active" && !batch.is_reconciled ? <><button className="icon-button" onClick={() => void openEdit(batch)} aria-label={`Sửa ${batch.code}`}><Edit2 size={16}/></button><button className="icon-button danger" disabled={saving} onClick={() => void cancelBatch(batch)} aria-label={`Hủy ${batch.code}`}><RotateCcw size={16}/></button></> : null}</td>
          </tr>;
        })}</tbody>
      </table>
      {!loading && batches.length === 0 ? <EmptyState title="Chưa có bảng kê Ship Ngoài" description="Không có phiên bàn giao trong khoảng ngày đã chọn."/> : null}
      {loading ? <EmptyState title="Đang tải bảng kê"/> : null}
    </section>

    {viewing ? <Modal title={`Chi tiết ${viewing.code}`} className="external-batch-detail-modal" onClose={() => setViewing(null)}>
      <div className="page-stack external-batch-detail">
        <div className="external-batch-detail-meta"><span>Bàn giao lúc <strong>{utcDateTime(viewing.handed_over_at)}</strong></span><span>Người bàn giao <strong>{viewing.created_by_name || "Không rõ"}</strong></span>{viewing.is_reconciled ? <span className="status-badge active"><CheckCircle2 size={14}/>Đã kiểm kê · đã khóa</span> : <span className={`status-badge ${viewing.status}`}>{viewing.status === "active" ? "Đang hiệu lực" : "Đã hủy"}</span>}</div>
        <section className="external-batch-detail-summary">
          <article><span className="detail-summary-icon"><Boxes size={22}/></span><small>Tổng số đơn</small><strong>{viewingSummaryItems.length} đơn</strong></article>
          <article><span className="detail-summary-icon"><Banknote size={22}/></span><small>Tổng tiền hàng</small><strong>{money(viewingGoodsTotal)}</strong></article>
          <article><span className="detail-summary-icon"><Truck size={22}/></span><small>Tiền ship thực tế</small><strong>{money(viewing.shipping_fee)}</strong></article>
          <article className="highlight"><span className="detail-summary-icon"><HandCoins size={22}/></span><small>Tiền ship ứng</small><strong>{money(viewing.advance_amount)}</strong></article>
          <article><span className="detail-summary-icon"><HandCoins size={22}/></span><small>Tiền ứng thực tế</small><strong>{money(viewingActualAdvance)}</strong><em>{viewing.advance_method === "transfer" ? "Chuyển khoản" : viewing.advance_method === "cash" ? "Tiền mặt" : "Chuyển khoản & Tiền mặt"}</em></article>
        </section>
        <div className="external-batch-detail-table"><table className="data-table"><thead><tr><th>Mã hóa đơn</th><th>Khách hàng</th><th>Địa chỉ giao hàng</th><th>Thanh toán</th><th className="numeric">Tổng tiền</th><th>Trạng thái trong phiên</th></tr></thead><tbody>{viewing.items.map((item) => <tr key={item.id} className={!item.is_active ? "removed-batch-item" : ""}><td className="code-cell">{item.invoice.code}</td><td>{item.invoice.customer?.name || "Khách lẻ"}</td><td className="external-batch-address">{item.invoice.customer?.address || "Chưa có địa chỉ"}</td><td>{item.invoice.is_paid_by_transfer ? <span className="invoice-payment-badge">Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD</span>}</td><td className="numeric">{numberText(item.invoice.total_amount)}</td><td><span className={`status-badge ${item.is_active ? "active" : "cancelled"}`}>{item.is_active ? "Đang trong bảng kê" : "Đã bỏ / hủy"}</span></td></tr>)}</tbody></table></div>
        <div className="form-actions"><button className="secondary-button" onClick={() => setViewing(null)}>Đóng</button></div>
      </div>
    </Modal> : null}

    {editing ? <Modal title={`Cập nhật ${editing.code}`} className="external-batch-edit-modal" onClose={() => !saving && setEditing(null)}>
      <form className="external-batch-edit-form-wide" onSubmit={(event) => void submit(event)}>
        <section className="external-batch-detail-summary external-batch-edit-summary">
          <article><span className="detail-summary-icon"><Boxes size={22}/></span><small>Tổng số đơn</small><strong>{selectedIds.length} đơn</strong></article>
          <article><span className="detail-summary-icon"><Banknote size={22}/></span><small>Tổng tiền hàng</small><strong>{money(selectedGoodsTotal)}</strong></article>
          <article><span className="detail-summary-icon"><Banknote size={22}/></span><small>Tổng tiền COD</small><strong>{money(codTotal)}</strong></article>
          <article className="highlight"><span className="detail-summary-icon"><HandCoins size={22}/></span><small>Tiền ship ứng</small><strong>{money(calculatedAdvance)}</strong></article>
        </section>
        <div className="external-batch-edit-workspace">
          <section className="external-batch-orders-panel">
            <header><span><strong>Danh sách hóa đơn</strong><small>{selectedIds.length} đơn đang trong bảng kê</small></span></header>
            <label>Thêm hóa đơn bằng mã<div className="external-batch-code-entry"><Search size={17}/><input value={invoiceCode} onChange={(event) => { setInvoiceCode(event.target.value); setInvoiceCodeError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addInvoiceByCode(); } }} placeholder="Nhập hoặc quét mã rồi nhấn Enter" autoComplete="off"/><button className="secondary-button" type="button" disabled={addingInvoice} onClick={() => void addInvoiceByCode()}>{addingInvoice ? <LoaderCircle className="loading-spinner" size={16}/> : "Thêm"}</button></div>{invoiceCodeError ? <span className="field-error">{invoiceCodeError}</span> : null}</label>
            <div className="external-batch-order-columns" aria-hidden="true"><span>Mã đơn</span><span>Khách hàng</span><span>Địa chỉ</span><span>Thanh toán</span><span>Thành tiền</span><span/></div>
            <div className="external-batch-invoice-picker">
              {selectedInvoices.map((invoice) => <article key={invoice.id} className="batch-invoice-row selected"><strong className="batch-invoice-code">{invoice.code}</strong><span className="batch-invoice-customer">{invoice.customer?.name || "Khách lẻ"}</span><small className="batch-invoice-address">{invoice.customer?.address || "Chưa có địa chỉ"}</small><span className="batch-invoice-payment">{invoice.is_paid_by_transfer ? <span className="invoice-payment-badge">Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD</span>}</span><strong className="batch-invoice-amount">{numberText(invoice.total_amount)}</strong><button className="icon-button danger" type="button" onClick={() => removeInvoice(invoice.id)} aria-label={`Bỏ ${invoice.code}`}><X size={16}/></button></article>)}
            </div>
          </section>
          <section className="external-batch-finance-panel">
            <header><span><strong>Thông tin tiền bàn giao</strong><small>Điều chỉnh phí ship và tiền ứng thực tế</small></span></header>
            <div className="external-batch-finance-fields">
              <label>Phí ship thực tế<input required inputMode="numeric" value={formatNumberInput(shippingFee, false)} onChange={(event) => changeShippingFee(event.target.value)}/></label>
              <label>Hình thức ứng<select value={advanceMethod} onChange={(event) => changeMethod(event.target.value as ExternalAdvanceMethod)}><option value="transfer">Chuyển khoản</option><option value="cash">Tiền mặt</option><option value="mixed">Chuyển khoản &amp; Tiền mặt</option></select></label>
              {advanceMethod !== "cash" ? <label>Tiền chuyển khoản<input required inputMode="numeric" value={formatNumberInput(transferAmount, false)} onChange={(event) => setTransferAmount(normalizeNumberInput(event.target.value, false))}/></label> : null}
              {advanceMethod !== "transfer" ? <label>Tiền mặt<input required inputMode="numeric" value={formatNumberInput(cashAmount, false)} onChange={(event) => setCashAmount(normalizeNumberInput(event.target.value, false))}/></label> : null}
            </div>
            <div className="external-batch-advance-result"><small>Tiền ship ứng sau điều chỉnh</small><strong>{money(calculatedAdvance)}</strong></div>
          </section>
        </div>
        {selectedIds.length === 0 ? <div className="alert error">Bảng kê phải còn ít nhất một đơn. Nếu muốn bỏ toàn bộ, hãy dùng chức năng Hủy bàn giao.</div> : null}
        <div className="form-actions external-batch-edit-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => setEditing(null)}>Đóng</button><button className="primary-button" disabled={saving || selectedIds.length === 0}>{saving ? <LoaderCircle className="loading-spinner" size={17}/> : <Edit2 size={17}/>}Lưu thay đổi</button></div>
      </form>
    </Modal> : null}
    {toast ? <ToastNotification title="Thành công" message={toast} variant="success" duration={3600} onClose={() => setToast(null)}/> : null}
  </div>;
}
