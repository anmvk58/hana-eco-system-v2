import {
  ArrowRight,
  Banknote,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  CreditCard,
  LoaderCircle,
  PackageSearch,
  RefreshCw,
  Search,
  Store,
  HandCoins,
  Truck,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { DateRangePicker } from "../components/DateRangePicker";
import { Modal } from "../components/Modal";
import { ToastNotification } from "../components/ToastNotification";
import type { ExternalAdvanceMethod, ExternalHandoverReconciliationRow, Invoice, RetailInvoiceReconciliation } from "../types";
import { money, todayInputValue, utcDateTime } from "../utils/format";

type ReconciliationTab = "unaudited" | "retail" | "external";
type RetailFilter = "pending" | "collected" | "all";

function searchableText(invoice: Invoice) {
  return [invoice.code, invoice.customer?.name, invoice.customer?.phone, invoice.customer?.address]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN");
}

function customerName(invoice: Invoice) {
  return invoice.customer?.name || "Khách không lưu thông tin";
}

function auditLabelText(invoice: Invoice) {
  if (invoice.audit_label === "retail") return "Khách lẻ";
  if (invoice.audit_label === "internal_shipper") return "Ship nội bộ";
  if (invoice.audit_label === "external_shipper") return "Ship ngoài";
  return "Chưa audit";
}

function advanceMethodText(method: ExternalAdvanceMethod) {
  if (method === "transfer") return "Chuyển khoản";
  if (method === "cash") return "Tiền mặt";
  return "Kết hợp";
}

export function OrderReconciliationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialToday = todayInputValue();
  const [fromDate, setFromDate] = useState(searchParams.get("from_date") ?? initialToday);
  const [toDate, setToDate] = useState(searchParams.get("to_date") ?? initialToday);
  const [tab, setTab] = useState<ReconciliationTab>("unaudited");
  const [retailFilter, setRetailFilter] = useState<RetailFilter>("pending");
  const [search, setSearch] = useState("");
  const [unaudited, setUnaudited] = useState<Invoice[]>([]);
  const [retailRows, setRetailRows] = useState<RetailInvoiceReconciliation[]>([]);
  const [externalRows, setExternalRows] = useState<ExternalHandoverReconciliationRow[]>([]);
  const [collecting, setCollecting] = useState<RetailInvoiceReconciliation | null>(null);
  const [reconcilingBatch, setReconcilingBatch] = useState<ExternalHandoverReconciliationRow | null>(null);
  const [markingRetailId, setMarkingRetailId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  async function load(selectedFromDate = fromDate, selectedToDate = toDate) {
    setLoading(true);
    setError("");
    try {
      const [nextUnaudited, nextRetail, nextExternal] = await Promise.all([
        api.orderReconciliation.unauditedInvoices(selectedFromDate || undefined, selectedToDate || undefined),
        api.orderReconciliation.retailInvoices(selectedFromDate || undefined, selectedToDate || undefined),
        api.orderReconciliation.externalHandoverBatches(selectedFromDate || undefined, selectedToDate || undefined),
      ]);
      setUnaudited(nextUnaudited);
      setRetailRows(nextRetail);
      setExternalRows(nextExternal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được dữ liệu kiểm kê đơn");
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
    if (!rangeIsComplete && !rangeWasCleared) return;
    const nextSearchParams = new URLSearchParams();
    if (selectedFromDate) nextSearchParams.set("from_date", selectedFromDate);
    if (selectedToDate) nextSearchParams.set("to_date", selectedToDate);
    setSearchParams(nextSearchParams, { replace: true });
    void load(selectedFromDate, selectedToDate);
  }

  const normalizedSearch = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi-VN");
  const visibleUnaudited = useMemo(
    () => unaudited.filter((invoice) => !normalizedSearch || searchableText(invoice).includes(normalizedSearch)),
    [unaudited, normalizedSearch],
  );
  const pendingRetailCount = retailRows.filter((row) => !row.collection).length;
  const collectedRetailCount = retailRows.length - pendingRetailCount;
  const pendingExternalCount = externalRows.filter((row) => !row.reconciliation).length;
  const reconciledExternalCount = externalRows.length - pendingExternalCount;
  const visibleRetail = useMemo(
    () => retailRows.filter((row) => {
      if (retailFilter === "pending" && row.collection) return false;
      if (retailFilter === "collected" && !row.collection) return false;
      return !normalizedSearch || searchableText(row.invoice).includes(normalizedSearch);
    }),
    [retailRows, retailFilter, normalizedSearch],
  );
  const visibleExternal = useMemo(
    () => externalRows.filter((row) => {
      if (retailFilter === "pending" && row.reconciliation) return false;
      if (retailFilter === "collected" && !row.reconciliation) return false;
      if (!normalizedSearch) return true;
      return [row.batch.code, row.batch.created_by_name, advanceMethodText(row.batch.advance_method)]
        .filter(Boolean)
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLocaleLowerCase("vi-VN")
        .includes(normalizedSearch);
    }),
    [externalRows, retailFilter, normalizedSearch],
  );

  async function markRetail(invoice: Invoice) {
    setMarkingRetailId(invoice.id);
    setError("");
    try {
      await api.orderReconciliation.markRetail(invoice.id);
      setToast(`Đã gán ${invoice.code} vào nhóm Khách lẻ.`);
      await load(fromDate, toDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gán nhãn Khách lẻ");
    } finally {
      setMarkingRetailId(null);
    }
  }

  function openCollection(row: RetailInvoiceReconciliation) {
    if (row.collection) return;
    setNote("");
    setError("");
    setCollecting(row);
  }

  async function submitCollection(event: FormEvent) {
    event.preventDefault();
    if (!collecting) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.orderReconciliation.collectRetailInvoice(collecting.invoice.id, {
        note: note.trim() || undefined,
      });
      setCollecting(null);
      setNote("");
      setToast(`Đã xác nhận thu tiền đơn ${result.invoice.code}.`);
      await load(fromDate, toDate);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCollecting(null);
        await load(fromDate, toDate);
      }
      setError(err instanceof Error ? err.message : "Không thể xác nhận thu tiền");
    } finally {
      setSaving(false);
    }
  }

  function openExternalReconciliation(row: ExternalHandoverReconciliationRow) {
    if (row.reconciliation) return;
    setNote("");
    setError("");
    setReconcilingBatch(row);
  }

  async function submitExternalReconciliation(event: FormEvent) {
    event.preventDefault();
    if (!reconcilingBatch) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.orderReconciliation.reconcileExternalHandoverBatch(reconcilingBatch.batch.id, {
        note: note.trim() || undefined,
      });
      setReconcilingBatch(null);
      setNote("");
      setToast(`Đã kiểm kê và xác nhận nhận tiền phiên ${result.batch.code}.`);
      await load(fromDate, toDate);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReconcilingBatch(null);
        await load(fromDate, toDate);
      }
      setError(err instanceof Error ? err.message : "Không thể kiểm kê phiên bàn giao Ship ngoài");
    } finally {
      setSaving(false);
    }
  }

  const currentRows = tab === "unaudited" ? visibleUnaudited.length : tab === "retail" ? visibleRetail.length : visibleExternal.length;

  return <div className="page-stack order-reconciliation-page">
    <section className="order-reconciliation-hero">
      <div className="order-reconciliation-hero-copy">
        <span className="order-reconciliation-hero-icon"><ClipboardCheck size={26}/></span>
        <span><h2>Kiểm kê đơn</h2><p>Theo dõi đơn chưa phân loại, tiền đơn đã audit và các phiên bàn giao Ship ngoài.</p></span>
      </div>
      <div className="order-reconciliation-hero-actions"><DateRangePicker from={fromDate} to={toDate} onChange={changeDateRange}/><button className="secondary-button" type="button" disabled={loading || saving} onClick={() => void load(fromDate, toDate)}>
        <RefreshCw className={loading ? "loading-spinner" : ""} size={17}/>Làm mới
      </button></div>
    </section>

    {error ? <div className="alert error">{error}</div> : null}

    <section className="order-reconciliation-overview">
      <article><span><PackageSearch size={20}/></span><small>Chưa audit</small><strong>{unaudited.length} đơn</strong></article>
      <article><span><Clock3 size={20}/></span><small>Khách lẻ / CK chờ kiểm kê</small><strong>{pendingRetailCount} đơn</strong></article>
      <article><span><CheckCircle2 size={20}/></span><small>Khách lẻ / CK đã kiểm kê</small><strong>{collectedRetailCount} đơn</strong></article>
      <article><span><Truck size={20}/></span><small>Phiên Ship ngoài chờ kiểm kê</small><strong>{pendingExternalCount} phiên</strong></article>
    </section>

    <section className="order-reconciliation-workspace">
      <div className="order-reconciliation-tabs" role="tablist" aria-label="Loại kiểm kê">
        <button className={tab === "unaudited" ? "active" : ""} type="button" role="tab" aria-selected={tab === "unaudited"} onClick={() => { setTab("unaudited"); setSearch(""); }}>
          <PackageSearch size={18}/><span>Đơn chưa audit</span><strong>{unaudited.length}</strong>
        </button>
        <button className={tab === "retail" ? "active" : ""} type="button" role="tab" aria-selected={tab === "retail"} onClick={() => { setTab("retail"); setSearch(""); }}>
          <Store size={18}/><span>Khách lẻ & chuyển khoản</span><strong>{pendingRetailCount}</strong>
        </button>
        <button className={tab === "external" ? "active" : ""} type="button" role="tab" aria-selected={tab === "external"} onClick={() => { setTab("external"); setSearch(""); }}>
          <Truck size={18}/><span>Kiểm kê Ship ngoài</span><strong>{pendingExternalCount}</strong>
        </button>
      </div>

      <div className="order-reconciliation-toolbar">
        <label className="order-reconciliation-search"><Search size={18}/><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "external" ? "Tìm mã phiên, người bàn giao hoặc phương thức..." : "Tìm mã hóa đơn, khách hàng, SĐT hoặc địa chỉ..."}/><span>{currentRows} kết quả</span></label>
        {tab !== "unaudited" ? <div className="order-reconciliation-filter" aria-label="Trạng thái kiểm kê">
          <button className={retailFilter === "pending" ? "active" : ""} type="button" onClick={() => setRetailFilter("pending")}>Chờ kiểm kê ({tab === "retail" ? pendingRetailCount : pendingExternalCount})</button>
          <button className={retailFilter === "collected" ? "active" : ""} type="button" onClick={() => setRetailFilter("collected")}>Đã kiểm kê ({tab === "retail" ? collectedRetailCount : reconciledExternalCount})</button>
          <button className={retailFilter === "all" ? "active" : ""} type="button" onClick={() => setRetailFilter("all")}>Tất cả</button>
        </div> : <div className="order-reconciliation-shortcuts"><Link to="/ship-management/internal-handover"><Truck size={16}/>Bàn giao ship nội bộ</Link><Link to="/ship-management"><ArrowRight size={16}/>Bàn giao khác</Link></div>}
      </div>

      {tab === "unaudited" ? <>
        <div className="order-reconciliation-table-wrap"><table className="data-table order-reconciliation-table"><thead><tr><th>Hóa đơn</th><th>Khách hàng</th><th>Địa chỉ</th><th>Tạo lúc</th><th className="numeric">Tổng tiền</th><th>Thao tác</th></tr></thead><tbody>{visibleUnaudited.map((invoice) => <tr key={invoice.id}><td><strong className="code-cell">{invoice.code}</strong><small>{invoice.is_paid_by_transfer ? "Đã chuyển khoản" : "Thu tiền khi giao"}</small></td><td><strong>{customerName(invoice)}</strong><small>{invoice.customer?.phone || "Không có SĐT"}</small></td><td className="order-reconciliation-address">{invoice.customer?.address || "—"}</td><td>{utcDateTime(invoice.created_at)}</td><td className="numeric strong">{money(invoice.total_amount)}</td><td><div className="order-reconciliation-actions"><button className="primary-button compact-button" type="button" disabled={markingRetailId !== null} onClick={() => void markRetail(invoice)}>{markingRetailId === invoice.id ? <LoaderCircle className="loading-spinner" size={15}/> : <Store size={15}/>}Gán Khách lẻ</button><Link className="secondary-button compact-button" to="/ship-management/internal-handover"><Truck size={15}/>Ship nội bộ</Link></div></td></tr>)}</tbody></table></div>
        <div className="order-reconciliation-mobile-list">{visibleUnaudited.map((invoice) => <article className="order-reconciliation-card" key={invoice.id}><header><span><strong>{invoice.code}</strong><small>{utcDateTime(invoice.created_at)}</small></span><b>{money(invoice.total_amount)}</b></header><div><h3>{customerName(invoice)}</h3><p>{invoice.customer?.phone || "Không có SĐT"}</p><p>{invoice.customer?.address || "Không có địa chỉ"}</p></div><footer><button className="primary-button" disabled={markingRetailId !== null} onClick={() => void markRetail(invoice)}><Store size={16}/>Gán Khách lẻ</button><Link className="secondary-button" to="/ship-management/internal-handover"><Truck size={16}/>Ship nội bộ</Link></footer></article>)}</div>
        {!loading && visibleUnaudited.length === 0 ? <EmptyState title={search ? "Không tìm thấy đơn phù hợp" : "Không còn đơn chưa audit"} description={search ? "Hãy thử mã hóa đơn, tên, SĐT hoặc địa chỉ khác." : "Tất cả đơn hiện tại đã được phân loại."}/> : null}
      </> : tab === "retail" ? <>
        <div className="order-reconciliation-table-wrap"><table className="data-table order-reconciliation-table retail"><thead><tr><th>Hóa đơn</th><th>Khách hàng</th><th>Phân loại</th><th>Thanh toán</th><th>Thời điểm audit</th><th className="numeric">Số tiền</th><th>Trạng thái kiểm kê</th><th></th></tr></thead><tbody>{visibleRetail.map((row) => <tr key={row.invoice.id}><td><strong className="code-cell">{row.invoice.code}</strong></td><td><strong>{customerName(row.invoice)}</strong><small>{row.invoice.customer?.phone || "Không có SĐT"}</small></td><td><span className={`audit-source-chip ${row.invoice.audit_label || "unaudited"}`}>{auditLabelText(row.invoice)}</span></td><td>{row.invoice.is_paid_by_transfer ? <span className="payment-chip transfer"><CreditCard size={14}/>Chuyển khoản</span> : <span className="payment-chip cash"><Banknote size={14}/>Tiền mặt</span>}</td><td>{row.invoice.audited_at ? utcDateTime(row.invoice.audited_at) : "—"}</td><td className="numeric strong">{money(row.invoice.total_amount)}</td><td>{row.collection ? <span className="reconciliation-collected"><CheckCircle2 size={15}/><span><strong>Đã kiểm kê</strong><small>{utcDateTime(row.collection.collected_at)} · {row.collection.collected_by_name || "Hệ thống"}</small></span></span> : <span className="status-badge pending">Chờ kiểm kê</span>}</td><td className="row-actions">{row.collection ? <button className="secondary-button compact-button" disabled><CheckCircle2 size={15}/>Đã kiểm kê</button> : <button className="primary-button compact-button" onClick={() => openCollection(row)}><Banknote size={15}/>Đánh dấu đã thu</button>}</td></tr>)}</tbody></table></div>
        <div className="order-reconciliation-mobile-list">{visibleRetail.map((row) => <article className={`order-reconciliation-card${row.collection ? " collected" : ""}`} key={row.invoice.id}><header><span><strong>{row.invoice.code}</strong><small>{row.invoice.audited_at ? utcDateTime(row.invoice.audited_at) : "Chưa audit"}</small></span><b>{money(row.invoice.total_amount)}</b></header><div><h3>{customerName(row.invoice)}</h3><p>{row.invoice.customer?.phone || "Không có SĐT"}</p><div className="order-reconciliation-card-tags"><span className={`audit-source-chip ${row.invoice.audit_label || "unaudited"}`}>{auditLabelText(row.invoice)}</span>{row.invoice.is_paid_by_transfer ? <span className="payment-chip transfer"><CreditCard size={14}/>Chuyển khoản</span> : <span className="payment-chip cash"><Banknote size={14}/>Tiền mặt</span>}</div>{row.collection ? <p className="collected-note"><CheckCircle2 size={15}/>Đã kiểm kê {utcDateTime(row.collection.collected_at)}</p> : null}</div><footer>{row.collection ? <button className="secondary-button" disabled><CheckCircle2 size={16}/>Đã kiểm kê</button> : <button className="primary-button" onClick={() => openCollection(row)}><Banknote size={16}/>Đánh dấu đã thu</button>}</footer></article>)}</div>
        {!loading && visibleRetail.length === 0 ? <EmptyState title="Không có đơn phù hợp" description={retailFilter === "pending" ? "Không còn đơn Khách lẻ hoặc đơn chuyển khoản đã audit nào chờ kiểm kê." : "Thử đổi trạng thái lọc hoặc từ khóa tìm kiếm."}/> : null}
      </> : <>
        <div className="order-reconciliation-table-wrap"><table className="data-table order-reconciliation-table external"><thead><tr><th>Phiên bàn giao</th><th>Bàn giao lúc</th><th>Người bàn giao</th><th className="numeric">Số đơn</th><th>Phương thức</th><th className="numeric">Tiền phải nhận</th><th className="numeric">Thực tế đã nhận</th><th>Trạng thái kiểm kê</th><th></th></tr></thead><tbody>{visibleExternal.map((row) => {
          const activeInvoiceCount = row.batch.items.filter((item) => item.is_active).length;
          const receivedAmount = Number(row.batch.transfer_amount) + Number(row.batch.cash_amount);
          return <tr key={row.batch.id}><td><strong className="code-cell">{row.batch.code}</strong></td><td>{utcDateTime(row.batch.handed_over_at)}</td><td>{row.batch.created_by_name || "—"}</td><td className="numeric strong">{activeInvoiceCount}</td><td><span className="payment-chip cash">{advanceMethodText(row.batch.advance_method)}</span></td><td className="numeric strong">{money(row.batch.advance_amount)}</td><td className="numeric strong">{money(receivedAmount)}</td><td>{row.reconciliation ? <span className="reconciliation-collected"><CheckCircle2 size={15}/><span><strong>Đã kiểm kê</strong><small>{utcDateTime(row.reconciliation.reconciled_at)} · {row.reconciliation.reconciled_by_name || "Hệ thống"}</small></span></span> : <span className="status-badge pending">Chờ kiểm kê</span>}</td><td className="row-actions">{row.reconciliation ? <button className="secondary-button compact-button" disabled><CheckCircle2 size={15}/>Đã nhận tiền</button> : <button className="primary-button compact-button" onClick={() => openExternalReconciliation(row)}><HandCoins size={15}/>Kiểm kê phiên</button>}</td></tr>;
        })}</tbody></table></div>
        <div className="order-reconciliation-mobile-list">{visibleExternal.map((row) => {
          const activeInvoiceCount = row.batch.items.filter((item) => item.is_active).length;
          const receivedAmount = Number(row.batch.transfer_amount) + Number(row.batch.cash_amount);
          return <article className={`order-reconciliation-card external${row.reconciliation ? " collected" : ""}`} key={row.batch.id}><header><span><strong>{row.batch.code}</strong><small>{utcDateTime(row.batch.handed_over_at)}</small></span><b>{activeInvoiceCount} đơn</b></header><div><h3>{row.batch.created_by_name || "Không rõ người bàn giao"}</h3><div className="order-reconciliation-external-money"><span><small>Phải nhận</small><strong>{money(row.batch.advance_amount)}</strong></span><span><small>Thực tế đã nhận</small><strong>{money(receivedAmount)}</strong></span></div><div className="order-reconciliation-card-tags"><span className="payment-chip cash">{advanceMethodText(row.batch.advance_method)}</span></div>{row.reconciliation ? <p className="collected-note"><CheckCircle2 size={15}/>Đã kiểm kê {utcDateTime(row.reconciliation.reconciled_at)}</p> : null}</div><footer>{row.reconciliation ? <button className="secondary-button" disabled><CheckCircle2 size={16}/>Đã nhận tiền</button> : <button className="primary-button" onClick={() => openExternalReconciliation(row)}><HandCoins size={16}/>Kiểm kê phiên</button>}</footer></article>;
        })}</div>
        {!loading && visibleExternal.length === 0 ? <EmptyState title="Không có phiên Ship ngoài phù hợp" description={retailFilter === "pending" ? "Không còn phiên bàn giao Ship ngoài nào chờ kiểm kê trong khoảng ngày." : "Thử đổi trạng thái lọc, khoảng ngày hoặc từ khóa."}/> : null}
      </>}
      {loading && currentRows === 0 ? <EmptyState title="Đang tải dữ liệu kiểm kê"/> : null}
    </section>

    {collecting ? <Modal title="Xác nhận thu tiền đơn Khách lẻ" className="order-reconciliation-modal retail-collection" onClose={() => !saving && setCollecting(null)}><form className="page-stack" onSubmit={(event) => void submitCollection(event)}>
      <div className="order-reconciliation-confirm-summary"><span className="order-reconciliation-customer-icon"><UserRound size={21}/></span><div><small>Hóa đơn</small><strong>{collecting.invoice.code}</strong><p>{customerName(collecting.invoice)} · {collecting.invoice.customer?.phone || "Không có SĐT"}</p></div><b>{money(collecting.invoice.total_amount)}</b></div>
      <div className="internal-cod-confirmation"><CheckCircle2 size={19}/><span>{collecting.invoice.is_paid_by_transfer ? "Đơn đã được khách chuyển khoản. Xác nhận để hoàn tất kiểm kê khoản tiền shop đã nhận." : "Xác nhận shop đã nhận đủ tiền của đơn Khách lẻ này."}</span></div>
      <label>Ghi chú kiểm kê<textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: Đã nhận đủ tiền mặt"/></label>
      <div className="form-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => setCollecting(null)}>Hủy</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="loading-spinner" size={17}/> : <Banknote size={17}/>}Xác nhận đã thu tiền</button></div>
    </form></Modal> : null}

    {reconcilingBatch ? <Modal title="Kiểm kê phiên bàn giao Ship ngoài" className="order-reconciliation-modal external" onClose={() => !saving && setReconcilingBatch(null)}><form className="page-stack" onSubmit={(event) => void submitExternalReconciliation(event)}>
      <div className="order-reconciliation-confirm-summary"><span className="order-reconciliation-customer-icon"><Truck size={21}/></span><div><small>Phiên bàn giao</small><strong>{reconcilingBatch.batch.code}</strong><p>{reconcilingBatch.batch.items.filter((item) => item.is_active).length} đơn · {advanceMethodText(reconcilingBatch.batch.advance_method)} · {utcDateTime(reconcilingBatch.batch.handed_over_at)}</p></div><b>{money(Number(reconcilingBatch.batch.transfer_amount) + Number(reconcilingBatch.batch.cash_amount))}</b></div>
      <section className="order-reconciliation-external-confirm"><article><Boxes size={18}/><span><small>Tiền phải nhận từ shipper</small><strong>{money(reconcilingBatch.batch.advance_amount)}</strong></span></article><article className="external-received-breakdown"><HandCoins size={18}/><span><small>Tiền thực tế đã nhận</small><strong>{money(Number(reconcilingBatch.batch.transfer_amount) + Number(reconcilingBatch.batch.cash_amount))}</strong><div><em><CreditCard size={14}/>Chuyển khoản <b>{money(reconcilingBatch.batch.transfer_amount)}</b></em><em><Banknote size={14}/>Tiền mặt <b>{money(reconcilingBatch.batch.cash_amount)}</b></em></div></span></article></section>
      <div className="internal-cod-confirmation"><CheckCircle2 size={19}/><span>Xác nhận phiên bàn giao đã được kiểm kê và shop đã nhận tiền thành công. Thao tác này không thể xác nhận lần hai.</span></div>
      <label>Ghi chú kiểm kê<textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: Đã đối chiếu đủ tiền chuyển khoản và tiền mặt"/></label>
      <div className="form-actions"><button className="secondary-button" type="button" disabled={saving} onClick={() => setReconcilingBatch(null)}>Hủy</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="loading-spinner" size={17}/> : <HandCoins size={17}/>}Xác nhận đã kiểm kê và nhận tiền</button></div>
    </form></Modal> : null}

    {toast ? <ToastNotification title="Cập nhật thành công" message={toast} variant="success" duration={3800} onClose={() => setToast(null)}/> : null}
  </div>;
}
