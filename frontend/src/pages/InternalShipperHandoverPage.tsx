import { ArrowRight, Ban, CheckCircle2, Clock3, Handshake, LoaderCircle, PackageCheck, RefreshCw, RotateCcw, Search, Truck, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { ToastNotification } from "../components/ToastNotification";
import type { InternalShipperAssignment, Invoice, Shipper } from "../types";
import { money, normalizeInvoiceCodeSearch, numberText, todayInputValue, utcDateTime } from "../utils/format";

const returnPath = "/ship-management/internal-handover";

export function InternalShipperHandoverPage() {
  const today = todayInputValue();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [assignments, setAssignments] = useState<InternalShipperAssignment[]>([]);
  const [shippers, setShippers] = useState<Shipper[]>([]);
  const [view, setView] = useState<"handover" | "assigned">("handover");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentShipperId, setAssignmentShipperId] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [shipperId, setShipperId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [recalling, setRecalling] = useState<InternalShipperAssignment | null>(null);
  const [recallReason, setRecallReason] = useState("");
  const [invoiceCode, setInvoiceCode] = useState("");
  const [quickAddError, setQuickAddError] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ title: string; message: string; variant: "success" | "warning" | "error" } | null>(null);

  async function load(from: string, to: string) {
    setLoading(true);
    setError("");
    try {
      const [nextInvoices, nextShippers, nextAssignments] = await Promise.all([
        api.shipManagement.unauditedInvoices(from, to),
        api.shipManagement.internalShippers(),
        api.shipManagement.internalHandoverInvoices(from, to),
      ]);
      setInvoices(nextInvoices);
      setShippers(nextShippers);
      setAssignments(nextAssignments);
      setShipperId((current) => nextShippers.some((shipper) => String(shipper.id) === current) ? current : String(nextShippers[0]?.id ?? ""));
      setSelectedIds([]);
      setInvoiceCode("");
      setQuickAddError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu bàn giao nội bộ");
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

  function openHandoverModal() {
    setError("");
    if (shippers.length === 0) {
      setError("Chưa có shipper nội bộ đang hoạt động để bàn giao");
      return;
    }
    setModalOpen(true);
  }

  async function submitHandover(event: FormEvent) {
    event.preventDefault();
    if (selectedIds.length === 0 || !shipperId) return;
    setSubmitting(true);
    setError("");
    setToast(null);
    try {
      const handedOver = await api.shipManagement.handoverToInternalShipper({
        invoice_ids: selectedIds,
        shipper_id: Number(shipperId),
      });
      const shipperName = shippers.find((shipper) => shipper.id === Number(shipperId))?.user.display_name ?? "shipper đã chọn";
      setModalOpen(false);
      setSelectedIds([]);
      setToast({
        title: "Bàn giao thành công",
        message: `Đã bàn giao ${handedOver.length} đơn cho ${shipperName}.`,
        variant: "success",
      });
      await load(fromDate, toDate);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setModalOpen(false);
        await load(fromDate, toDate);
        setToast({ title: "Danh sách đã thay đổi", message: `${err.message}. Danh sách đã được làm mới.`, variant: "warning" });
      } else {
        setError(err instanceof Error ? err.message : "Không bàn giao được đơn cho shipper nội bộ");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function openRecall(assignment: InternalShipperAssignment) {
    if (!assignment.can_recall) return;
    setError("");
    setRecallReason("");
    setRecalling(assignment);
  }

  async function submitRecall(event: FormEvent) {
    event.preventDefault();
    if (!recalling) return;
    setSubmitting(true);
    setError("");
    setToast(null);
    try {
      const recalled = await api.shipManagement.recallInternalHandover(recalling.invoice.id, recallReason.trim());
      setRecalling(null);
      setRecallReason("");
      setToast({
        title: "Thu hồi thành công",
        message: `${recalled.code} đã trở về danh sách đơn chưa audit.`,
        variant: "success",
      });
      await load(fromDate, toDate);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRecalling(null);
        await load(fromDate, toDate);
        setToast({ title: "Không thể thu hồi", message: err.message, variant: "warning" });
      } else {
        setError(err instanceof Error ? err.message : "Không thu hồi được đơn khỏi shipper nội bộ");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;
  const availableInvoices = invoices.filter((invoice) => !selectedIds.includes(invoice.id));
  const selectedInvoices = invoices.filter((invoice) => selectedIds.includes(invoice.id));
  const codTotal = selectedInvoices.reduce((sum, invoice) => sum + (invoice.is_paid_by_transfer ? 0 : Number(invoice.total_amount)), 0);
  const visibleAssignments = useMemo(() => {
    const keyword = assignmentSearch.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi-VN");
    return assignments.filter(({ invoice }) => {
      if (assignmentShipperId !== "all" && String(invoice.assigned_shipper_id) !== assignmentShipperId) return false;
      if (!keyword) return true;
      return [invoice.code, invoice.customer?.name, invoice.customer?.phone, invoice.customer?.address, invoice.assigned_shipper?.user.display_name]
        .filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi-VN").includes(keyword);
    });
  }, [assignmentSearch, assignmentShipperId, assignments]);
  const assignmentShippers = useMemo(() => Array.from(new Map(assignments.flatMap(({ invoice }) => invoice.assigned_shipper ? [[invoice.assigned_shipper.id, invoice.assigned_shipper] as const] : [])).values()).sort((left, right) => left.user.display_name.localeCompare(right.user.display_name, "vi-VN")), [assignments]);
  const deliveredAssignmentCount = assignments.filter(({ invoice }) => invoice.delivered_at).length;
  const shippingAssignmentCount = assignments.filter(({ invoice }) => invoice.status !== "cancelled" && !invoice.delivered_at).length;
  const cancelledAssignmentCount = assignments.filter(({ invoice }) => invoice.status === "cancelled").length;

  return <div className="page-stack shipping-claim-page ship-management-page">
    <section className="toolbar shipping-toolbar">
      <div className="shipping-toolbar-copy"><h2 className="toolbar-title"><Truck size={20}/>Bàn giao Ship Nội Bộ</h2><span className="field-hint">Chọn các đơn chưa audit và bàn giao trực tiếp cho một shipper nội bộ đang hoạt động.</span></div>
      <span className="toolbar-spacer"/>
      <div className="ship-management-controls">
        <DateRangePicker from={fromDate} to={toDate} onChange={changeDateRange}/>
        <button className="secondary-button ship-management-refresh" disabled={loading || submitting || !fromDate || !toDate} onClick={() => void load(fromDate, toDate)}><RefreshCw size={17}/>Làm mới</button>
      </div>
    </section>
    {error ? <div className="alert error">{error}</div> : null}
    <div className="internal-handover-tabs" role="tablist" aria-label="Quản lý bàn giao nội bộ">
      <button className={view === "handover" ? "active" : ""} type="button" role="tab" aria-selected={view === "handover"} onClick={() => setView("handover")}><Handshake size={17}/><span>Bàn giao đơn</span><strong>{invoices.length}</strong></button>
      <button className={view === "assigned" ? "active" : ""} type="button" role="tab" aria-selected={view === "assigned"} onClick={() => setView("assigned")}><Truck size={17}/><span>Đơn đã giao shipper</span><strong>{assignments.length}</strong></button>
    </div>
    {view === "handover" ? <>
    <section className="ship-management-workspace">
      <div className="ship-management-column available-column">
        <header className="ship-management-column-header">
          <div><span className="ship-management-step">1</span><span><strong>Đơn chưa audit</strong><small>{availableInvoices.length} đơn đang chờ chọn</small></span></div>
          <label className="ship-management-select-all"><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : invoices.map((item) => item.id))}/><span>{allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}</span></label>
        </header>
        <form className="ship-management-code-entry" onSubmit={addInvoiceByCode}>
          <Search size={18}/>
          <input value={invoiceCode} onChange={(event) => { setInvoiceCode(event.target.value); setQuickAddError(""); }} placeholder="Nhập hoặc quét mã hóa đơn rồi nhấn Enter" aria-label="Mã hóa đơn cần bàn giao" autoComplete="off"/>
          <button className="secondary-button" type="submit" disabled={loading}>Thêm</button>
        </form>
        {quickAddError ? <div className="ship-management-code-error">{quickAddError}</div> : null}
        <div className="ship-management-order-list">
          {availableInvoices.map((invoice) => <article key={invoice.id} className="ship-management-order" role="checkbox" aria-checked="false" tabIndex={0} onClick={() => toggle(invoice.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(invoice.id); } }}>
            <div className="ship-management-order-main"><strong>{invoice.customer?.name ?? "Khách lẻ"}</strong><span>{invoice.customer?.phone || "Không có số điện thoại"}</span><small>{invoice.customer?.address || "Chưa có địa chỉ"}</small></div>
            <Link className="ship-management-order-code" to={`/invoices/${invoice.id}`} state={{ returnTo: returnPath }} onClick={(event) => event.stopPropagation()} aria-label={`Xem chi tiết ${invoice.code}`}>{invoice.code}</Link>
            <div className="ship-management-order-payment">{invoice.is_paid_by_transfer ? <span className="invoice-payment-badge"><CheckCircle2 size={14}/>Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD</span>}<strong>{numberText(invoice.total_amount)}</strong></div>
            <button className="ship-management-move-button add" type="button" onClick={(event) => { event.stopPropagation(); toggle(invoice.id); }} aria-label={`Chọn ${invoice.code}`}><ArrowRight size={18}/></button>
          </article>)}
          {!loading && availableInvoices.length === 0 ? <EmptyState title={invoices.length === 0 ? "Không còn đơn chưa audit" : "Đã chọn toàn bộ đơn"} description={invoices.length === 0 ? "Không có đơn hợp lệ trong khoảng ngày đã chọn." : "Các đơn đã được chuyển sang danh sách chuẩn bị bàn giao."}/> : null}
          {loading ? <EmptyState title="Đang tải đơn chưa audit"/> : null}
        </div>
      </div>

      <div className="ship-management-column selected-column">
        <header className="ship-management-column-header">
          <div><span className="ship-management-step">2</span><span><strong>Chuẩn bị bàn giao nội bộ</strong><small>{selectedInvoices.length} đơn đã lựa chọn</small></span></div>
          {selectedInvoices.length > 0 ? <button className="text-button" type="button" onClick={() => setSelectedIds([])}>Bỏ tất cả</button> : null}
        </header>
        <div className="ship-management-handover-footer">
          <div><span>Tổng số đơn</span><strong>{selectedInvoices.length}</strong></div>
          <div><span>Tổng COD</span><strong>{money(codTotal)}</strong></div>
          <button className="primary-button" disabled={selectedIds.length === 0 || submitting || shippers.length === 0} onClick={openHandoverModal}><Truck size={17}/>Bàn giao {selectedIds.length || ""} đơn</button>
        </div>
        <div className="ship-management-order-list selected-orders">
          {selectedInvoices.map((invoice) => <article key={invoice.id} className="ship-management-order selected-order">
            <div className="ship-management-order-main"><strong>{invoice.customer?.name ?? "Khách lẻ"}</strong><span>{invoice.customer?.phone || "Không có số điện thoại"}</span><small>{invoice.customer?.address || "Chưa có địa chỉ"}</small></div>
            <Link className="ship-management-order-code" to={`/invoices/${invoice.id}`} state={{ returnTo: returnPath }} aria-label={`Xem chi tiết ${invoice.code}`}>{invoice.code}</Link>
            <div className="ship-management-order-payment">{invoice.is_paid_by_transfer ? <span className="invoice-payment-badge"><CheckCircle2 size={14}/>Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD</span>}<strong>{numberText(invoice.total_amount)}</strong></div>
            <button className="ship-management-move-button remove" type="button" onClick={() => toggle(invoice.id)} aria-label={`Bỏ chọn ${invoice.code}`}><X size={18}/></button>
          </article>)}
          {selectedInvoices.length === 0 ? <EmptyState title="Chưa có đơn được chọn" description="Chọn đơn bên trái hoặc nhập mã hóa đơn để thêm vào danh sách bàn giao."/> : null}
        </div>
      </div>
    </section>
    <div className="shipping-mobile-actions" aria-label="Thao tác bàn giao"><button className="secondary-button shipping-mobile-refresh" disabled={loading || submitting} onClick={() => void load(fromDate, toDate)} aria-label="Làm mới danh sách"><RefreshCw size={19}/></button><button className="primary-button shipping-mobile-claim" disabled={selectedIds.length === 0 || submitting || shippers.length === 0} onClick={openHandoverModal}><Handshake size={18}/><span>{selectedIds.length > 0 ? `Bàn giao ${selectedIds.length} đơn` : "Chọn đơn để bàn giao"}</span></button></div>
    </> : <section className="internal-handover-assigned-panel">
      <header className="internal-handover-assigned-heading"><div><h2>Đơn đã giao cho Shipper nội bộ</h2><p>Thu hồi đơn để đưa về trạng thái chưa audit và phân loại lại khi cần.</p></div><div className="internal-handover-assigned-stats"><span><Clock3 size={15}/>{shippingAssignmentCount} đang giao</span><span><PackageCheck size={15}/>{deliveredAssignmentCount} đã giao thành công</span>{cancelledAssignmentCount > 0 ? <span><Ban size={15}/>{cancelledAssignmentCount} đã hủy</span> : null}</div></header>
      <div className="internal-handover-assigned-filters"><label className="internal-handover-assigned-search"><Search size={18}/><input type="search" value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} placeholder="Tìm mã hóa đơn, khách hàng, SĐT hoặc địa chỉ..."/><span>{visibleAssignments.length} kết quả</span></label><label className="internal-handover-shipper-filter"><Truck size={17}/><span>Shipper đang giữ</span><select value={assignmentShipperId} onChange={(event) => setAssignmentShipperId(event.target.value)}><option value="all">Tất cả shipper ({assignments.length} đơn)</option>{assignmentShippers.map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.user.display_name}</option>)}</select></label></div>
      <div className="internal-handover-assigned-table-wrap"><table className="data-table internal-handover-assigned-table"><thead><tr><th>Hóa đơn</th><th>Khách hàng</th><th>Địa chỉ giao hàng</th><th>Shipper đang giữ</th><th>Bàn giao lúc</th><th>Trạng thái giao</th><th>Thanh toán</th><th></th></tr></thead><tbody>{visibleAssignments.map((assignment) => {
        const invoice = assignment.invoice;
        const deliveryText = invoice.status === "cancelled" ? "Đã hủy" : invoice.delivered_at ? "Đã giao thành công" : "Đang giao";
        return <tr className={invoice.delivered_at ? "delivered" : ""} key={invoice.id}><td><Link className="code-cell" to={`/invoices/${invoice.id}`} state={{ returnTo: returnPath }}>{invoice.code}</Link><small>{money(invoice.total_amount)}</small></td><td><strong>{invoice.customer?.name || "Khách lẻ"}</strong><small>{invoice.customer?.phone || "Không có SĐT"}</small></td><td className="internal-handover-address">{invoice.customer?.address || "Chưa có địa chỉ"}</td><td><strong>{invoice.assigned_shipper?.user.display_name || "Không rõ shipper"}</strong><small>{invoice.assigned_shipper?.phone || invoice.assigned_shipper?.user.username || "—"}</small></td><td>{invoice.audited_at ? utcDateTime(invoice.audited_at) : "—"}</td><td><span className={`internal-handover-delivery-badge ${invoice.status === "cancelled" ? "cancelled" : invoice.delivered_at ? "delivered" : "shipping"}`}>{invoice.status === "cancelled" ? <Ban size={14}/> : invoice.delivered_at ? <PackageCheck size={14}/> : <Clock3 size={14}/>} {deliveryText}</span></td><td>{invoice.is_paid_by_transfer ? <span className="invoice-payment-badge"><CheckCircle2 size={14}/>Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD</span>}</td><td className="row-actions"><button className="secondary-button compact-button internal-handover-recall-button" type="button" disabled={!assignment.can_recall || submitting} title={assignment.recall_block_reason || "Thu hồi đơn khỏi shipper"} onClick={() => openRecall(assignment)}><RotateCcw size={15}/>{assignment.can_recall ? "Thu hồi" : "Không thể thu hồi"}</button></td></tr>;
      })}</tbody></table></div>
      <div className="internal-handover-assigned-mobile-list">{visibleAssignments.map((assignment) => {
        const invoice = assignment.invoice;
        return <article className={invoice.delivered_at ? "delivered" : ""} key={invoice.id}><header><Link to={`/invoices/${invoice.id}`} state={{ returnTo: returnPath }}>{invoice.code}</Link>{invoice.status === "cancelled" ? <span className="internal-handover-delivery-badge cancelled"><Ban size={14}/>Đã hủy</span> : invoice.delivered_at ? <span className="internal-handover-delivery-badge delivered"><PackageCheck size={14}/>Đã giao</span> : <span className="internal-handover-delivery-badge shipping"><Clock3 size={14}/>Đang giao</span>}</header><div><h3>{invoice.customer?.name || "Khách lẻ"}</h3><p>{invoice.customer?.phone || "Không có SĐT"}</p><p className="internal-handover-mobile-address">{invoice.customer?.address || "Chưa có địa chỉ"}</p><p>Shipper: <strong>{invoice.assigned_shipper?.user.display_name || "Không rõ"}</strong></p><p>Bàn giao: {invoice.audited_at ? utcDateTime(invoice.audited_at) : "—"}</p><span>{invoice.is_paid_by_transfer ? <span className="invoice-payment-badge"><CheckCircle2 size={14}/>Đã chuyển khoản</span> : <span className="invoice-cod-badge">COD · {money(invoice.total_amount)}</span>}</span>{assignment.recall_block_reason ? <small className="internal-handover-recall-block"><Ban size={13}/>{assignment.recall_block_reason}</small> : null}</div><footer><button className="secondary-button" type="button" disabled={!assignment.can_recall || submitting} onClick={() => openRecall(assignment)}><RotateCcw size={16}/>{assignment.can_recall ? "Thu hồi đơn" : "Không thể thu hồi"}</button></footer></article>;
      })}</div>
      {!loading && visibleAssignments.length === 0 ? <EmptyState title={assignmentSearch ? "Không tìm thấy đơn phù hợp" : "Chưa có đơn giao Shipper nội bộ"} description={assignmentSearch ? "Hãy thử mã hóa đơn, khách hàng hoặc tên shipper khác." : "Không có đơn nào được bàn giao trong khoảng ngày đã chọn."}/> : null}
      {loading && assignments.length === 0 ? <EmptyState title="Đang tải đơn đã bàn giao"/> : null}
    </section>}

    {modalOpen ? <Modal title={`Bàn giao ${selectedIds.length} đơn cho Ship Nội Bộ`} onClose={() => !submitting && setModalOpen(false)}>
      <form className="form-grid ship-handover-form" onSubmit={(event) => void submitHandover(event)}>
        <div className="handover-retail-note span-2"><Truck size={20}/><span><strong>Bàn giao trực tiếp</strong><small>Các đơn sẽ xuất hiện trong danh sách “Đơn đã nhận” của shipper được chọn.</small></span></div>
        <label className="handover-kind-field span-2"><span>Shipper nội bộ</span><select required autoFocus value={shipperId} onChange={(event) => setShipperId(event.target.value)}>{shippers.map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.user.display_name}{shipper.phone ? ` — ${shipper.phone}` : ""}</option>)}</select></label>
        <div className="form-actions handover-form-actions span-2"><button className="secondary-button" type="button" disabled={submitting} onClick={() => setModalOpen(false)}>Hủy</button><button className="primary-button" type="submit" disabled={submitting || !shipperId}>{submitting ? <LoaderCircle className="loading-spinner" size={17}/> : <Truck size={17}/>}Xác nhận bàn giao</button></div>
      </form>
    </Modal> : null}
    {recalling ? <Modal title={`Thu hồi đơn ${recalling.invoice.code}`} className="internal-handover-recall-modal" onClose={() => !submitting && setRecalling(null)}><form className="page-stack internal-handover-recall-form" onSubmit={(event) => void submitRecall(event)}>
      <div className="internal-handover-recall-summary"><span><RotateCcw size={22}/></span><div><small>Thu hồi từ shipper</small><strong>{recalling.invoice.assigned_shipper?.user.display_name || "Không rõ shipper"}</strong><p>{recalling.invoice.customer?.name || "Khách lẻ"} · {money(recalling.invoice.total_amount)}</p></div></div>
      {recalling.invoice.delivered_at ? <div className="internal-handover-recall-warning delivered"><PackageCheck size={19}/><span>Đơn đã được shipper xác nhận giao thành công. Khi thu hồi, hóa đơn sẽ quay về trạng thái <strong>Đã tạo</strong> và xóa thông tin giao thành công.</span></div> : <div className="internal-handover-recall-warning"><Clock3 size={19}/><span>Đơn sẽ được gỡ khỏi Shipper nội bộ và quay về danh sách <strong>chưa audit</strong>.</span></div>}
      <div className="internal-handover-recall-note"><CheckCircle2 size={18}/><span>Sau thu hồi, quản lý có thể bàn giao lại hoặc gán nhãn <strong>Khách lẻ</strong>. Nếu gán Khách lẻ, đơn vẫn phải thực hiện kiểm kê tiền theo quy trình.</span></div>
      <label>Lý do thu hồi<textarea maxLength={500} value={recallReason} onChange={(event) => setRecallReason(event.target.value)} placeholder="Ví dụ: Giao nhầm shipper, khách đổi phương thức nhận..."/></label>
      <div className="form-actions"><button className="secondary-button" type="button" disabled={submitting} onClick={() => setRecalling(null)}>Hủy</button><button className="secondary-button danger-button" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="loading-spinner" size={17}/> : <RotateCcw size={17}/>}Xác nhận thu hồi</button></div>
    </form></Modal> : null}
    {toast ? <ToastNotification title={toast.title} message={toast.message} variant={toast.variant} duration={3600} onClose={() => setToast(null)}/> : null}
  </div>;
}
