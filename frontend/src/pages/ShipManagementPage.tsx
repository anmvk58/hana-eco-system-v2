import { ArrowRight, Calculator, CheckCircle2, HandCoins, Handshake, LoaderCircle, ReceiptText, RefreshCw, Search, Store, Truck, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { ToastNotification } from "../components/ToastNotification";
import type { ExternalAdvanceMethod, Invoice, ShipHandoverPayload } from "../types";
import { formatNumberInput, money, normalizeInvoiceCodeSearch, normalizeNumberInput, numberText, todayInputValue } from "../utils/format";

type HandoverKind = "retail" | "external_shipper";

export function ShipManagementPage() {
  const today = todayInputValue();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [handoverIds, setHandoverIds] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [kind, setKind] = useState<HandoverKind>("external_shipper");
  const [advanceMethod, setAdvanceMethod] = useState<ExternalAdvanceMethod>("transfer");
  const [shippingFee, setShippingFee] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [invoiceCode, setInvoiceCode] = useState("");
  const [quickAddError, setQuickAddError] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ title: string; message: string; variant: "success" | "warning" | "error" } | null>(null);

  async function load(from: string, to: string) {
    setLoading(true);
    setError("");
    try {
      setInvoices(await api.shipManagement.unauditedInvoices(from, to));
      setSelectedIds([]);
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
    setQuickAddError("");
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  function selectInvoiceByCode() {
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

  function resetForm() {
    setKind("external_shipper");
    setAdvanceMethod("transfer");
    setShippingFee("");
    setTransferAmount("");
    setCashAmount("");
  }

  function openHandoverModal() {
    setKind("external_shipper");
    setAdvanceMethod("transfer");
    setShippingFee("");
    setTransferAmount(String(handoverInvoiceTotal));
    setCashAmount("");
    setModalOpen(true);
  }

  function changeShippingFee(value: string) {
    const normalizedValue = normalizeNumberInput(value, false);
    setShippingFee(normalizedValue);
    if (advanceMethod === "transfer") {
      setTransferAmount(String(handoverInvoiceTotal - Number(normalizedValue || 0)));
    }
  }

  function changeAdvanceMethod(method: ExternalAdvanceMethod) {
    setAdvanceMethod(method);
    if (method === "transfer") {
      setTransferAmount(String(calculatedAdvanceAmount));
    }
  }

  async function submitHandover(event: FormEvent) {
    event.preventDefault();
    if (selectedIds.length === 0) return;
    setError("");
    setToast(null);

    const transfer = Number(transferAmount || 0);
    const cash = Number(cashAmount || 0);
    const actualShippingFee = Number(shippingFee || 0);
    if (kind === "external_shipper" && !shippingFee.trim()) {
      setError("Vui lòng nhập tiền ship thực tế phải trả");
      return;
    }
    if (kind === "external_shipper" && advanceMethod === "transfer" && transfer <= 0) {
      setError("Vui lòng nhập số tiền chuyển khoản thực tế");
      return;
    }
    if (kind === "external_shipper" && advanceMethod === "cash" && cash <= 0) {
      setError("Vui lòng nhập số tiền mặt thực tế");
      return;
    }
    if (kind === "external_shipper" && advanceMethod === "mixed" && (transfer <= 0 || cash <= 0)) {
      setError("Vui lòng nhập cả số tiền chuyển khoản và tiền mặt thực tế");
      return;
    }

    const payload: ShipHandoverPayload = { invoice_ids: selectedIds, audit_label: kind };
    if (kind === "external_shipper") {
      payload.external_handoff = {
        advance_method: advanceMethod,
        shipping_fee: String(actualShippingFee),
        transfer_amount: advanceMethod === "cash" ? "0" : String(transfer),
        cash_amount: advanceMethod === "transfer" ? "0" : String(cash),
      };
    }

    setSubmitting(true);
    try {
      const handedOver = await api.shipManagement.handover(payload);
      const processedIds = handedOver.map((invoice) => invoice.id);
      setHandoverIds(processedIds);
      setModalOpen(false);
      setSelectedIds([]);
      setToast({
        title: "Bàn giao thành công",
        message: kind === "retail" ? `Đã đánh dấu ${handedOver.length} đơn Khách lẻ.` : `Đã bàn giao ${handedOver.length} đơn cho Ship Ngoài.`,
        variant: "success",
      });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise((resolve) => window.setTimeout(resolve, 560));
      }
      resetForm();
      await load(fromDate, toDate);
      setHandoverIds([]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setModalOpen(false);
        await load(fromDate, toDate);
        setToast({ title: "Danh sách đã thay đổi", message: `${err.message}. Danh sách đã được làm mới.`, variant: "warning" });
      } else {
        setError(err instanceof Error ? err.message : "Không bàn giao được đơn");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;
  const availableInvoices = invoices.filter((invoice) => !selectedIds.includes(invoice.id));
  const selectedInvoices = invoices.filter((invoice) => selectedIds.includes(invoice.id));
  const handoverInvoiceTotal = selectedInvoices.reduce(
    (sum, invoice) => sum + (invoice.is_paid_by_transfer ? 0 : Number(invoice.total_amount)),
    0,
  );
  const calculatedAdvanceAmount = handoverInvoiceTotal - Number(shippingFee || 0);
  return <div className="page-stack shipping-claim-page ship-management-page">
    <section className="toolbar shipping-toolbar">
      <div className="shipping-toolbar-copy"><h2 className="toolbar-title"><Handshake size={20}/>Quản lý đơn ship</h2><span className="field-hint">Chọn các đơn chưa audit trong khoảng ngày đã chọn để đánh dấu Khách lẻ hoặc bàn giao cho Ship Ngoài.</span></div>
      <span className="toolbar-spacer"/>
      <div className="ship-management-controls">
        <DateRangePicker from={fromDate} to={toDate} onChange={changeDateRange}/>
        <button className="secondary-button ship-management-refresh" disabled={loading || submitting || !fromDate || !toDate} onClick={() => void load(fromDate, toDate)}><RefreshCw size={17}/>Làm mới</button>
      </div>
    </section>
    {error ? <div className="alert error">{error}</div> : null}
    <section className="ship-management-workspace">
      <div className="ship-management-column available-column">
        <header className="ship-management-column-header">
          <div><span className="ship-management-step">1</span><span><strong>Đơn chưa audit</strong><small>{availableInvoices.length} đơn đang chờ chọn</small></span></div>
          <label className="ship-management-select-all"><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : invoices.map((item) => item.id))}/><span>{allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</span></label>
        </header>
        <form className="ship-management-code-entry" onSubmit={addInvoiceByCode}>
          <Search size={18}/>
          <input value={invoiceCode} onChange={(event) => { setInvoiceCode(event.target.value); setQuickAddError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); selectInvoiceByCode(); } }} placeholder="Nhập hoặc quét mã hóa đơn rồi nhấn Enter" aria-label="Mã hóa đơn cần bàn giao" autoComplete="off"/>
          <button className="secondary-button" type="submit" disabled={loading}>Thêm</button>
        </form>
        {quickAddError ? <div className="ship-management-code-error">{quickAddError}</div> : null}
        <div className="ship-management-order-list">
          {availableInvoices.map((invoice) => <article key={invoice.id} className={`ship-management-order${handoverIds.includes(invoice.id) ? " handover-success" : ""}`} role="checkbox" aria-checked="false" tabIndex={0} onClick={() => toggle(invoice.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(invoice.id); } }}>
            <div className="ship-management-order-main"><strong>{invoice.customer?.name ?? "Khách lẻ"}</strong><span>{invoice.customer?.phone || "Không có số điện thoại"}</span><small>{invoice.customer?.address || "Chưa có địa chỉ"}</small></div>
            <Link className="ship-management-order-code" to={`/invoices/${invoice.id}`} state={{ returnTo: "/ship-management" }} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} aria-label={`Xem chi tiết ${invoice.code}`}>{invoice.code}</Link>
            <div className="ship-management-order-payment">{invoice.is_paid_by_transfer ? <span className="invoice-payment-badge"><CheckCircle2 size={14}/>Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD</span>}<strong>{numberText(invoice.total_amount)}</strong></div>
            <button className="ship-management-move-button add" type="button" onClick={(event) => { event.stopPropagation(); toggle(invoice.id); }} aria-label={`Chọn ${invoice.code}`}><ArrowRight size={18}/></button>
          </article>)}
          {!loading && availableInvoices.length === 0 ? <EmptyState title={invoices.length === 0 ? "Không còn đơn chưa audit" : "Đã chọn toàn bộ đơn"} description={invoices.length === 0 ? "Không có đơn hợp lệ trong khoảng ngày đã chọn." : "Các đơn đã được chuyển sang danh sách chuẩn bị bàn giao."}/> : null}
          {loading ? <EmptyState title="Đang tải đơn chưa audit"/> : null}
        </div>
      </div>

      <div className="ship-management-column selected-column">
        <header className="ship-management-column-header">
          <div><span className="ship-management-step">2</span><span><strong>Chuẩn bị bàn giao</strong><small>{selectedInvoices.length} đơn đã lựa chọn</small></span></div>
          {selectedInvoices.length > 0 ? <button className="text-button" type="button" onClick={() => setSelectedIds([])}>Bỏ tất cả</button> : null}
        </header>
        <div className="ship-management-handover-footer">
          <div><span>Tổng số đơn</span><strong>{selectedInvoices.length}</strong></div>
          <div><span>Tổng hóa đơn</span><strong>{money(handoverInvoiceTotal)}</strong></div>
          <button className="primary-button" disabled={selectedIds.length === 0 || submitting} onClick={openHandoverModal}><Handshake size={17}/>Bàn giao {selectedIds.length || ""} đơn</button>
        </div>
        <div className="ship-management-order-list selected-orders">
          {selectedInvoices.map((invoice) => <article key={invoice.id} className="ship-management-order selected-order">
            <div className="ship-management-order-main"><strong>{invoice.customer?.name ?? "Khách lẻ"}</strong><span>{invoice.customer?.phone || "Không có số điện thoại"}</span><small>{invoice.customer?.address || "Chưa có địa chỉ"}</small></div>
            <Link className="ship-management-order-code" to={`/invoices/${invoice.id}`} state={{ returnTo: "/ship-management" }} aria-label={`Xem chi tiết ${invoice.code}`}>{invoice.code}</Link>
            <div className="ship-management-order-payment">{invoice.is_paid_by_transfer ? <span className="invoice-payment-badge"><CheckCircle2 size={14}/>Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD</span>}<strong>{numberText(invoice.total_amount)}</strong></div>
            <button className="ship-management-move-button remove" type="button" onClick={() => toggle(invoice.id)} aria-label={`Bỏ chọn ${invoice.code}`}><X size={18}/></button>
          </article>)}
          {selectedInvoices.length === 0 ? <EmptyState title="Chưa có đơn được chọn" description="Chọn đơn bên trái hoặc nhập mã hóa đơn để thêm vào danh sách bàn giao."/> : null}
        </div>
      </div>
    </section>
    <div className="shipping-mobile-actions" aria-label="Thao tác bàn giao"><button className="secondary-button shipping-mobile-refresh" disabled={loading || submitting} onClick={() => void load(fromDate, toDate)} aria-label="Làm mới danh sách"><RefreshCw size={19}/></button><button className="primary-button shipping-mobile-claim" disabled={selectedIds.length === 0 || submitting} onClick={openHandoverModal}><Handshake size={18}/><span>{selectedIds.length > 0 ? `Bàn giao ${selectedIds.length} đơn` : "Chọn đơn để bàn giao"}</span></button></div>

    {modalOpen ? <Modal title={`Bàn giao ${selectedIds.length} đơn`} onClose={() => !submitting && setModalOpen(false)}>
      <form className="form-grid ship-handover-form" onSubmit={(event) => void submitHandover(event)}>
        <label className="handover-kind-field span-2"><span>Hình thức bàn giao</span><select value={kind} onChange={(event) => setKind(event.target.value as HandoverKind)}><option value="external_shipper">Ship Ngoài</option><option value="retail">Khách lẻ</option></select></label>
        {kind === "external_shipper" ? <>
          <section className="handover-finance-card span-2">
            <header className="handover-section-heading"><span className="handover-section-icon"><Calculator size={19}/></span><span><strong>Đối soát tiền bàn giao</strong><small>Số tiền cần thu từ các đơn COD đã chọn</small></span></header>
            <div className="handover-invoice-total"><ReceiptText size={22}/><span><small>Tổng tiền hóa đơn</small><strong>{money(handoverInvoiceTotal)}</strong><em>Không bao gồm đơn đã chuyển khoản</em></span></div>
            <div className="handover-calculation-fields">
              <label><span>Tiền ship thực tế phải trả</span><div className="handover-money-input"><input required autoFocus inputMode="numeric" value={formatNumberInput(shippingFee, false)} onChange={(event) => changeShippingFee(event.target.value)}/><b>₫</b></div></label>
              <label className="handover-advance-result"><span>Số tiền ship ứng</span><div className="handover-money-input"><input readOnly value={formatNumberInput(calculatedAdvanceAmount, false)}/><b>₫</b></div></label>
            </div>
            <div className="handover-formula"><Calculator size={15}/><span><strong>{money(handoverInvoiceTotal)}</strong> − <strong>{money(Number(shippingFee || 0))}</strong> = <b>{money(calculatedAdvanceAmount)}</b></span></div>
          </section>
          <section className="handover-advance-card span-2">
            <header className="handover-section-heading"><span className="handover-section-icon blue"><HandCoins size={19}/></span><span><strong>Thông tin tiền ứng thực tế</strong><small>Chọn phương thức và nhập số tiền đã nhận</small></span></header>
            <label>Hình thức ứng<select value={advanceMethod} onChange={(event) => changeAdvanceMethod(event.target.value as ExternalAdvanceMethod)}><option value="transfer">Chuyển khoản</option><option value="cash">Tiền mặt</option><option value="mixed">Chuyển khoản &amp; Tiền mặt</option></select></label>
            <div className={`handover-actual-fields ${advanceMethod}`}>
              {advanceMethod !== "cash" ? <label>Tiền chuyển khoản thực tế<div className="handover-money-input"><input required inputMode="numeric" value={formatNumberInput(transferAmount, false)} onChange={(event) => setTransferAmount(normalizeNumberInput(event.target.value, false))}/><b>₫</b></div></label> : null}
              {advanceMethod !== "transfer" ? <label>Tiền mặt thực tế<div className="handover-money-input"><input required inputMode="numeric" value={formatNumberInput(cashAmount, false)} onChange={(event) => setCashAmount(normalizeNumberInput(event.target.value, false))}/><b>₫</b></div></label> : null}
            </div>
          </section>
        </> : <div className="handover-retail-note span-2"><Store size={20}/><span><strong>Đánh dấu Khách lẻ</strong><small>Các đơn đã chọn sẽ được audit là Khách lẻ và không gán cho shipper.</small></span></div>}
        <div className="form-actions handover-form-actions span-2"><button className="secondary-button" type="button" disabled={submitting} onClick={() => setModalOpen(false)}>Hủy</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="loading-spinner" size={17}/> : kind === "retail" ? <Store size={17}/> : <Truck size={17}/>}Xác nhận bàn giao</button></div>
      </form>
    </Modal> : null}
    {toast ? <ToastNotification title={toast.title} message={toast.message} variant={toast.variant} duration={3600} onClose={() => setToast(null)}/> : null}
  </div>;
}
