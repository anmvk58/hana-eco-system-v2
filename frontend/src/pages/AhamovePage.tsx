import { ArrowRight, CheckCircle2, Handshake, LoaderCircle, RefreshCw, Search, Truck, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";


import "./AhamovePage.css";

import { ApiError, api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { InvoiceReceipt } from "../components/InvoiceReceipt";
import { Modal } from "../components/Modal";
import { ToastNotification } from "../components/ToastNotification";
import { TransferPaymentButton } from "../components/TransferPaymentButton";
import type { Invoice, AhamoveHandoverPayload } from "../types";
import { formatNumberInput, money, normalizeInvoiceCodeSearch, normalizeNumberInput, numberText, todayInputValue } from "../utils/format";

export function AhamovePage() {
  const today = todayInputValue();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [handoverIds, setHandoverIds] = useState<number[]>([]);
  const [shippingFee, setShippingFee] = useState("0");
  const [invoiceCode, setInvoiceCode] = useState("");
  const [quickAddError, setQuickAddError] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ title: string; message: string; variant: "success" | "warning" | "error" } | null>(null);

  async function load(from: string, to: string, preserveSelection = false) {
    setLoading(true);
    setError("");
    try {
      const updatedInvoices = await api.ahamove.unauditedInvoices(from, to);
      setInvoices(updatedInvoices);
      setSelectedIds((ids) => preserveSelection ? ids.filter((id) => updatedInvoices.some((invoice) => invoice.id === id)) : []);
      setInvoiceCode("");
      setQuickAddError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được đơn chưa audit trong khoảng ngày đã chọn");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fromDate && toDate) void load(fromDate, toDate);
  }, [fromDate, toDate]);

  function changeDateRange(from: string, to: string) {
    if (!from && !to) {
      setFromDate(today);
      setToDate(today);
      return;
    }
    setFromDate(from);
    setToDate(to);
  }

  function toggle(id: number) {
    if (loading || submitting || transferBusy) return;
    setQuickAddError("");
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  function selectInvoiceByCode() {
    if (loading || submitting || transferBusy) return;
    const normalizedCode = normalizeInvoiceCodeSearch(invoiceCode).toUpperCase();
    setInvoiceCode(normalizedCode);
    if (!normalizedCode) {
      setQuickAddError("Vui lòng nhập mã hóa đơn");
      return;
    }
    const invoice = invoices.find((item) => item.code.toUpperCase() === normalizedCode);
    if (!invoice) {
      setQuickAddError("Không tìm thấy đơn chưa audit có mã này trong khoảng ngày đã chọn");
      return;
    }
    if (selectedIds.includes(invoice.id)) {
      setQuickAddError(`${invoice.code} đã nằm trong danh sách chuẩn bị bàn giao`);
      return;
    }
    setSelectedIds((ids) => [...ids, invoice.id]);
    setInvoiceCode("");
    setQuickAddError("");
  }

  function addInvoiceByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    selectInvoiceByCode();
  }

  async function submitHandover(event: FormEvent) {
    event.preventDefault();
    if (selectedIds.length === 0 || loading || submitting || transferBusy) return;
    setError("");
    setToast(null);

    const actualShippingFee = Number(shippingFee || 0);
    if (!Number.isFinite(actualShippingFee) || actualShippingFee < 0) {
      setError("Tiền ship thực tế phải là số không âm");
      return;
    }
    if (!Number.isFinite(calculatedAdvanceAmount) || calculatedAdvanceAmount < 0) {
      setError("Số tiền cần ứng phải lớn hơn hoặc bằng 0. Vui lòng kiểm tra tổng tiền COD và tiền ship thực tế");
      return;
    }

    const payload: AhamoveHandoverPayload = {
      invoice_ids: selectedIds,
      audit_label: "external_shipper",
      external_handoff: {
        advance_method: "transfer",
        shipping_fee: String(actualShippingFee),
        transfer_amount: String(calculatedAdvanceAmount),
        cash_amount: "0",
      },
    };

    setSubmitting(true);
    try {
      const handedOver = await api.ahamove.handover(payload);
      const processedIds = handedOver.map((invoice) => invoice.id);
      setHandoverIds(processedIds);
      setSelectedIds([]);
      setToast({
        title: "Bàn giao thành công",
        message: `Đã bàn giao ${handedOver.length} đơn cho Ship Ngoài.`,
        variant: "success",
      });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise((resolve) => window.setTimeout(resolve, 560));
      }
      setShippingFee("0");
      await load(fromDate, toDate);
      setHandoverIds([]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await load(fromDate, toDate);
        setToast({ title: "Danh sách đã thay đổi", message: `${err.message}. Danh sách đã được làm mới.`, variant: "warning" });
      } else {
        setError(err instanceof Error ? err.message : "Không bàn giao được đơn");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const receiptInvoice = invoices.find((invoice) => invoice.id === receiptInvoiceId);
  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;
  const availableInvoices = invoices.filter((invoice) => !selectedIds.includes(invoice.id));
  const selectedInvoices = invoices.filter((invoice) => selectedIds.includes(invoice.id));
  const handoverInvoiceTotal = selectedInvoices.reduce(
    (sum, invoice) => sum + (invoice.is_paid_by_transfer ? 0 : Number(invoice.total_amount)),
    0,
  );
  const calculatedAdvanceAmount = handoverInvoiceTotal - Number(shippingFee || 0);

  return <div className="page-stack shipping-claim-page ship-management-page ahamove-page">
    <section className="toolbar shipping-toolbar">
      <div className="shipping-toolbar-copy"><h2 className="toolbar-title"><Handshake size={20}/>AHAMOVE</h2><span className="field-hint">Chọn các đơn chưa audit trong khoảng ngày đã chọn để bàn giao cho Ship Ngoài.</span></div>
      <span className="toolbar-spacer"/>
      <div className="ship-management-controls">
        <DateRangePicker from={fromDate} to={toDate} onChange={changeDateRange} disabled={loading || submitting || transferBusy}/>
        <button className="secondary-button ship-management-refresh" disabled={loading || submitting || transferBusy || !fromDate || !toDate} onClick={() => void load(fromDate, toDate)}><RefreshCw size={17}/>Làm mới</button>
      </div>
    </section>
    {error ? <div className="alert error">{error}</div> : null}
    <section className="ship-management-workspace">
      <div className="ship-management-column available-column">
        <header className="ship-management-column-header">
          <div><span className="ship-management-step">1</span><span><strong>Đơn chưa audit</strong><small>{availableInvoices.length} đơn đang chờ chọn</small></span></div>
          <label className="ship-management-select-all"><input type="checkbox" checked={allSelected} disabled={loading || submitting || transferBusy} onChange={() => setSelectedIds(allSelected ? [] : invoices.map((item) => item.id))}/><span>{allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</span></label>
        </header>
        <form className="ship-management-code-entry" onSubmit={addInvoiceByCode}>
          <Search size={18}/>
          <input autoFocus value={invoiceCode} onChange={(event) => { setInvoiceCode(event.target.value); setQuickAddError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); selectInvoiceByCode(); } }} placeholder="Nhập hoặc quét mã hóa đơn rồi nhấn Enter" aria-label="Mã hóa đơn cần bàn giao" autoComplete="off"/>
          <button className="secondary-button" type="submit" disabled={loading || submitting || transferBusy}>Thêm</button>
        </form>
        {quickAddError ? <div className="ship-management-code-error">{quickAddError}</div> : null}
        <div className="ship-management-order-list">
          {availableInvoices.map((invoice) => <article key={invoice.id} className={`ship-management-order${handoverIds.includes(invoice.id) ? " handover-success" : ""}`} role="checkbox" aria-checked="false" tabIndex={0} onClick={() => toggle(invoice.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(invoice.id); } }}>
            <div className="ship-management-order-main"><strong>{invoice.customer?.name ?? "Khách lẻ"}</strong><span>{invoice.customer?.phone || "Không có số điện thoại"}</span><small>{invoice.customer?.address || "Chưa có địa chỉ"}</small></div>
            <button className="shipping-invoice-preview-button ship-management-order-code" type="button" onClick={(event) => { event.stopPropagation(); setReceiptInvoiceId(invoice.id); }} onKeyDown={(event) => event.stopPropagation()} aria-label={`Xem chi tiết ${invoice.code}`}>{invoice.code}</button>
            <div className="ship-management-order-payment">{invoice.is_paid_by_transfer ? <span className="invoice-payment-badge"><CheckCircle2 size={14}/>Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD</span>}<strong>{numberText(invoice.total_amount)}</strong>{!invoice.is_paid_by_transfer ? <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><TransferPaymentButton invoice={invoice} disabled={loading || submitting || transferBusy} onBusyChange={setTransferBusy} onChanged={() => load(fromDate, toDate, true)}/></span> : null}</div>
            <button className="ship-management-move-button add" type="button" onClick={(event) => { event.stopPropagation(); toggle(invoice.id); }} aria-label={`Chọn ${invoice.code}`}><ArrowRight size={18}/></button>
          </article>)}
          {!loading && availableInvoices.length === 0 ? <EmptyState title={invoices.length === 0 ? "Không còn đơn chưa audit" : "Đã chọn toàn bộ đơn"} description={invoices.length === 0 ? "Không có đơn hợp lệ trong khoảng ngày đã chọn." : "Các đơn đã được chuyển sang danh sách chuẩn bị bàn giao."}/> : null}
          {loading ? <EmptyState title="Đang tải đơn chưa audit"/> : null}
        </div>
      </div>

      <div className="ship-management-column selected-column">
        <header className="ship-management-column-header">
          <div><span className="ship-management-step">2</span><span><strong>Chuẩn bị bàn giao</strong><small>{selectedInvoices.length} đơn đã lựa chọn</small></span></div>
          {selectedInvoices.length > 0 ? <button className="text-button" type="button" disabled={loading || submitting || transferBusy} onClick={() => setSelectedIds([])}>Bỏ tất cả</button> : null}
        </header>
        <div className="ship-management-handover-footer">
          <div><span>Tổng số đơn</span><strong>{selectedInvoices.length}</strong></div>
          <div><span>Tổng tiền hóa đơn</span><strong>{money(handoverInvoiceTotal)}</strong><small>Không gồm đơn đã chuyển khoản</small></div>
        </div>
        <div className="ship-management-order-list selected-orders" role="region" aria-label="Các đơn đã chọn" tabIndex={0}>
          {selectedInvoices.map((invoice) => <article key={invoice.id} className="ship-management-order selected-order">
            <div className="ship-management-order-main"><strong>{invoice.customer?.name ?? "Khách lẻ"}</strong><span>{invoice.customer?.phone || "Không có số điện thoại"}</span><small>{invoice.customer?.address || "Chưa có địa chỉ"}</small></div>
            <button className="shipping-invoice-preview-button ship-management-order-code" type="button" onClick={(event) => { event.stopPropagation(); setReceiptInvoiceId(invoice.id); }} onKeyDown={(event) => event.stopPropagation()} aria-label={`Xem chi tiết ${invoice.code}`}>{invoice.code}</button>
            <div className="ship-management-order-payment">{invoice.is_paid_by_transfer ? <span className="invoice-payment-badge"><CheckCircle2 size={14}/>Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD</span>}<strong>{numberText(invoice.total_amount)}</strong>{!invoice.is_paid_by_transfer ? <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><TransferPaymentButton invoice={invoice} disabled={loading || submitting || transferBusy} onBusyChange={setTransferBusy} onChanged={() => load(fromDate, toDate, true)}/></span> : null}</div>
            <button className="ship-management-move-button remove" type="button" onClick={() => toggle(invoice.id)} aria-label={`Bỏ chọn ${invoice.code}`}><X size={18}/></button>
          </article>)}
          {selectedInvoices.length === 0 ? <EmptyState title="Chưa có đơn được chọn" description="Chọn đơn bên trái hoặc nhập mã hóa đơn để thêm vào danh sách bàn giao."/> : null}
        </div>

        <form className="form-grid ship-handover-form ahamove-handover-form" onSubmit={(event) => void submitHandover(event)}>
          <fieldset disabled={loading || submitting || transferBusy || selectedIds.length === 0} className="ahamove-form-fields span-2">
            <section className="handover-finance-card span-2">
              <div className="handover-calculation-fields">
                <label><span>Tiền ship thực tế</span><div className="handover-money-input"><input inputMode="numeric" placeholder="0" onBlur={() => { if (!shippingFee.trim()) setShippingFee("0"); }} value={formatNumberInput(shippingFee, false)} onChange={(event) => setShippingFee(normalizeNumberInput(event.target.value, false))}/><b>₫</b></div></label>
                <label className="handover-advance-result"><span>Số tiền cần ứng</span><div className="handover-money-input"><input readOnly value={formatNumberInput(calculatedAdvanceAmount, false)}/><b>₫</b></div></label>
              </div>
            </section>
          </fieldset>
          <div className="form-actions handover-form-actions span-2"><button className="primary-button" type="submit" disabled={selectedIds.length === 0 || loading || submitting || transferBusy}>{submitting ? <LoaderCircle className="loading-spinner" size={17}/> : <Truck size={17}/>}{submitting ? "Đang bàn giao..." : "Bàn giao"}</button></div>
        </form>
      </div>
    </section>

    {receiptInvoice ? <Modal className="shipping-invoice-preview-modal" title={`Hóa đơn ${receiptInvoice.code}`} onClose={() => setReceiptInvoiceId(null)}>
      <div className="shipping-invoice-preview-content"><InvoiceReceipt invoice={receiptInvoice}/></div>
    </Modal> : null}

    {toast ? <ToastNotification title={toast.title} message={toast.message} variant={toast.variant} duration={3600} onClose={() => setToast(null)}/> : null}
  </div>;
}
