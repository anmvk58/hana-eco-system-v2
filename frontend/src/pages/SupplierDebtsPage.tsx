import { Banknote, Check, Edit2, Eye, Plus, RefreshCw, Undo2, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Link, useSearchParams } from "react-router-dom";
import { DateRangePicker } from "../components/DateRangePicker";
import { SupplierDebtEntryEditor } from "../components/SupplierDebtEntryEditor";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { ToastNotification } from "../components/ToastNotification";
import { supplierSum } from "../features/supplierDebt";
import type { Supplier, SupplierPayload, SupplierDebtEntry, SupplierDebtPayment, SupplierDebtHistory, SupplierDebtEntryPage } from "../types";
import { dateOnly, dateTime, todayInputValue } from "../utils/format";

const blankSupplier: SupplierPayload = { name: "", phone: "", address: "", note: "", is_active: true };
const kindLabels = { purchase: "Phiếu nhập hàng", increase: "Tăng công nợ", decrease: "Giảm công nợ" };
const historyLabels: Record<string, string> = { entry_create: "Lập phiếu", entry_update: "Sửa phiếu", entry_cancel: "Hủy phiếu", payment_create: "Thanh toán", payment_undo: "Hoàn tác thanh toán" };
const amountText = (amount: string | number) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(amount))} ₫`;
const message = (err: unknown) => err instanceof ApiError && err.status === 422 && err.message === "HTTP 422"
  ? "Dữ liệu chưa hợp lệ. Kiểm tra tên hàng/nội dung, ngày, số lượng và số tiền (tối đa 2 số lẻ; số lượng tối đa 3 số lẻ)."
  : err instanceof Error ? err.message : "Không thực hiện được thao tác. Vui lòng thử lại.";

function EntryLines({ entry }: { entry: SupplierDebtEntry }) {
  return <>
    {entry.items.length > 0 ? <div className="supplier-table-scroll"><table className="data-table standard-list-table"><thead><tr><th>Tên hàng</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>
      {entry.items.map((item, index) => <tr key={index}><td>{item.name}</td><td>{Number(item.quantity).toLocaleString("vi-VN", { maximumFractionDigits: 3 })}</td><td>{amountText(item.unit_price)}</td><td>{amountText(item.line_total)}</td></tr>)}
    </tbody></table></div> : null}
    {entry.note ? <p className="supplier-note">{entry.note}</p> : null}
  </>;
}

export function SupplierDebtsPage({ entriesOnly = false }: { entriesOnly?: boolean }) {
  const [params, setParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("supplier_debts.manage");
  const canPay = hasPermission("supplier_debts.pay");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState(entriesOnly ? Math.max(0, Number(params.get("supplier")) || 0) : 0);
  const [ledgerOpen, setLedgerOpen] = useState(entriesOnly);
  const [fromDate, setFromDate] = useState(entriesOnly ? params.get("from_date") || "" : "");
  const [toDate, setToDate] = useState(entriesOnly ? params.get("to_date") || "" : "");
  const [range, setRange] = useState({ from: fromDate, to: toDate });
  const [refresh, setRefresh] = useState(0);
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<"entries" | "payments">(entriesOnly && Number(params.get("supplier")) > 0 && params.get("tab") === "payments" ? "payments" : "entries");
  const [state, setState] = useState(entriesOnly && ["all", "pending", "paid", "cancelled"].includes(params.get("state") || "") ? params.get("state")! : entriesOnly ? "all" : "pending");
  const [page, setPage] = useState(entriesOnly ? Math.max(1, Math.floor(Number(params.get("page")) || 1)) : 1);
  const [total, setTotal] = useState(0);
  const [entrySummary, setEntrySummary] = useState({ total_increase: "0", total_decrease: "0", pending_amount: "0" });
  const [entries, setEntries] = useState<SupplierDebtEntry[]>([]);
  const [payments, setPayments] = useState<SupplierDebtPayment[]>([]);
  const [selected, setSelected] = useState<SupplierDebtEntry[]>([]);
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierPayload>({ ...blankSupplier });
  const [editingSupplierId, setEditingSupplierId] = useState<number>();
  const [editingEntry, setEditingEntry] = useState<SupplierDebtEntry>();
  const [detailEntry, setDetailEntry] = useState<SupplierDebtEntry | null>(null);
  const [detailPayment, setDetailPayment] = useState<SupplierDebtPayment | null>(null);
  const [audit, setAudit] = useState<SupplierDebtHistory[]>([]);
  const [auditError, setAuditError] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(todayInputValue());
  const [method, setMethod] = useState<"cash" | "transfer">("transfer");
  const [paymentNote, setPaymentNote] = useState("");
  const [cancelTarget, setCancelTarget] = useState<{ entry?: SupplierDebtEntry; payment?: SupplierDebtPayment } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const mixedSelection = new Set(selected.map((entry) => entry.supplier_id)).size > 1;
  const selectedTotal = supplierSum(selected.map((entry) => entry.signed_amount));

  useEffect(() => {
    let cancelled = false;
    setSupplierLoading(true);
    setLoadError("");
    void api.supplierDebts.suppliers(range.from, range.to).then((data) => {
      if (cancelled) return;
      setSuppliers(data);
    }).catch((err) => { if (!cancelled) setLoadError(message(err)); })
      .finally(() => { if (!cancelled) setSupplierLoading(false); });
    return () => { cancelled = true; };
  }, [refresh, range, entriesOnly]);

  useEffect(() => {
    let cancelled = false;
    if (paymentOpen || !ledgerOpen || !entriesOnly) return;
    setSelected([]);
    setEntries([]);
    setPayments([]);
    setTotal(0);
    setEntrySummary({ total_increase: "0", total_decrease: "0", pending_amount: "0" });
    if (tab === "payments" && !supplierId) return;
    setLoading(true);
    setLoadError("");
    const request = tab === "entries" ? api.supplierDebts.entries(supplierId || undefined, state, page, range.from, range.to) : api.supplierDebts.payments(supplierId, page, range.from, range.to);
    void request.then((data) => {
      if (cancelled) return;
      if (tab === "entries") { setEntries(data.items as SupplierDebtEntry[]); setEntrySummary(data as SupplierDebtEntryPage); }
      else setPayments(data.items as SupplierDebtPayment[]);
      setTotal(data.total);
    }).catch((err) => { if (!cancelled) setLoadError(message(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supplierId, tab, state, page, refresh, range, ledgerOpen, paymentOpen, entriesOnly]);

  useEffect(() => {
    let cancelled = false;
    setAudit([]);
    setAuditError("");
    if (!detailEntry && !detailPayment) return;
    void api.supplierDebts.history(detailEntry?.supplier_id ?? detailPayment!.supplier_id, detailEntry?.id, detailPayment?.id).then((data) => { if (!cancelled) setAudit(data); })
      .catch((err) => { if (!cancelled) setAuditError(message(err)); });
    return () => { cancelled = true; };
  }, [detailEntry, detailPayment, supplierId]);

  useEffect(() => {
    if (!entriesOnly) return;
    const next = new URLSearchParams();
    if (supplierId) next.set("supplier", String(supplierId));
    if (range.from) next.set("from_date", range.from);
    if (range.to) next.set("to_date", range.to);
    if (state !== "all") next.set("state", state);
    if (page > 1) next.set("page", String(page));
    if (tab === "payments") next.set("tab", tab);
    if (params.toString() !== next.toString()) setParams(next, { replace: true });
  }, [entriesOnly, supplierId, range, state, page, tab, params, setParams]);

  function reload() { setRefresh((value) => value + 1); }
  function changeRange(from: string, to: string) {
    setFromDate(from); setToDate(to);
    if ((from && to) || (!from && !to)) { setRange({ from, to }); setPage(1); }
  }
  function editSupplier(item?: Supplier) {
    setEditingSupplierId(item?.id);
    setSupplierForm(item ? { name: item.name, phone: item.phone, address: item.address, note: item.note, is_active: item.is_active } : { ...blankSupplier });
    setSettingsOpen(true); setModalError("");
  }
  function viewSupplier(item: Supplier) {
    setDetailSupplier(item);
  }
  function closeModal(close: () => void) { if (!busy) { close(); setModalError(""); } }
  function openEntry(entry: SupplierDebtEntry) {
    setModalError(""); setDetailEntry(null); setLedgerOpen(false); setEditingEntry(entry);
  }
  function openCancel(target: { entry?: SupplierDebtEntry; payment?: SupplierDebtPayment }) {
    setDetailEntry(null); setDetailPayment(null); setCancelTarget(target); setCancelReason(""); setModalError("");
  }
  async function saveSupplier(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setModalError("");
    try {
      await api.supplierDebts.saveSupplier(supplierForm, editingSupplierId);
      setSupplierForm({ ...blankSupplier }); setEditingSupplierId(undefined);
      setSettingsOpen(false);
      setToast("Đã lưu nhà cung cấp."); reload();
    } catch (err) { setModalError(message(err)); } finally { setBusy(false); }
  }
  async function toggleSupplier(item: Supplier) {
    if (busy) return;
    setBusy(true); setLoadError("");
    try {
      await api.supplierDebts.saveSupplier({ name: item.name, phone: item.phone, address: item.address, note: item.note, is_active: !item.is_active }, item.id);
      setToast(item.is_active ? "Đã ngừng sử dụng nhà cung cấp. Công nợ được giữ nguyên." : "Đã kích hoạt nhà cung cấp."); reload();
    } catch (err) { setLoadError(message(err)); } finally { setBusy(false); }
  }
  async function pay(event: FormEvent) {
    event.preventDefault(); if (busy || selected.length === 0 || new Set(selected.map((entry) => entry.supplier_id)).size !== 1) return;
    setBusy(true); setModalError("");
    try {
      const result = await api.supplierDebts.pay({ supplier_id: selected[0].supplier_id, entries: selected.map((entry) => ({ id: entry.id, revision: entry.revision })),
        expected_amount: selectedTotal, paid_on: paidOn, method, note: paymentNote });
      setPaymentOpen(false); setLedgerOpen(true); setSelected([]); setToast(`Đã thanh toán ${result.code}: ${amountText(result.amount)}.`); reload();
    } catch (err) { setModalError(message(err)); } finally { setBusy(false); }
  }
  async function confirmCancel(event: FormEvent) {
    event.preventDefault(); if (!cancelTarget || busy) return;
    setBusy(true); setModalError("");
    try {
      if (cancelTarget.entry) await api.supplierDebts.cancelEntry(cancelTarget.entry, cancelReason);
      else if (cancelTarget.payment) await api.supplierDebts.undoPayment(cancelTarget.payment.id, cancelReason);
      setCancelTarget(null); setLedgerOpen(true); setToast("Đã cập nhật công nợ."); reload();
    } catch (err) { setModalError(message(err)); } finally { setBusy(false); }
  }
  function toggleEntry(entry: SupplierDebtEntry) {
    setSelected((current) => current.some((item) => item.id === entry.id) ? current.filter((item) => item.id !== entry.id) : [...current, entry]);
  }
  const eligible = entries.filter((entry) => !entry.payment_id && !entry.cancelled_at);
  const allSelected = eligible.length > 0 && eligible.every((entry) => selected.some((item) => item.id === entry.id));
  const modalAlert = modalError ? <div className="alert error" role="alert">{modalError}</div> : null;
  const auditView = <section className="supplier-audit"><h3>Lịch sử thao tác</h3>{auditError ? <p className="alert error">{auditError}</p> : null}
    {audit.map((item) => <p key={item.id}><strong>{historyLabels[item.action] || item.action}</strong> · {item.actor_name || "Hệ thống"} · {dateTime(item.occurred_at)}{item.details.reason ? <span> — {item.details.reason}</span> : null}</p>)}
  </section>;
  const ledgerContent = <div className="page-stack supplier-ledger-list">
      {entriesOnly ? <div className="supplier-tabs" role="tablist" aria-label="Nội dung công nợ">
        <button role="tab" aria-selected={tab === "entries"} className={tab === "entries" ? "active" : ""} onClick={() => { setTab("entries"); setPage(1); }}>Phiếu công nợ</button>
        <button role="tab" disabled={!supplierId} title={!supplierId ? "Chọn nhà cung cấp để xem lịch sử thanh toán" : undefined} aria-selected={tab === "payments"} className={tab === "payments" ? "active" : ""} onClick={() => { setTab("payments"); setPage(1); }}>Lịch sử thanh toán</button>
      </div> : null}
      {selected.length > 0 && tab === "entries" ? <div className="supplier-selection"><span>Đã chọn <strong>{selected.length}</strong> phiếu · Tổng thanh toán: <strong>{amountText(selectedTotal)}</strong></span><button className="primary-button" disabled={!canPay || loading || mixedSelection || Number(selectedTotal) < 0 || Number(selectedTotal) > 999999999999.99} onClick={() => { setLedgerOpen(false); setPaymentOpen(true); setPaidOn(todayInputValue()); setPaymentNote(""); setModalError(""); }}><Check size={17}/>Thanh toán đã chọn</button>{mixedSelection ? <small>Chỉ chọn các phiếu của cùng một nhà cung cấp để thanh toán.</small> : null}{Number(selectedTotal) < 0 ? <small>Chọn thêm phiếu tăng công nợ để bù trừ số tiền âm.</small> : null}</div> : null}
      <section className="table-panel supplier-table-scroll" aria-busy={loading}>
        {tab === "entries" ? <table className="data-table standard-list-table supplier-entry-table"><thead><tr>
          {canPay ? <th><input type="checkbox" aria-label="Chọn tất cả phiếu trên trang" checked={allSelected} disabled={loading || eligible.length === 0} onChange={() => setSelected(allSelected ? [] : eligible)}/></th> : null}
          <th>Ngày / Mã phiếu</th>{entriesOnly ? <th>Nhà cung cấp</th> : null}<th>Nội dung</th><th>Loại phiếu</th><th className="supplier-number">Số tiền công nợ</th><th>Trạng thái</th><th>Thao tác</th>
        </tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}>
          {canPay ? <td><input type="checkbox" aria-label={`Chọn ${entry.code}`} disabled={!!entry.payment_id || !!entry.cancelled_at || loading} checked={selected.some((item) => item.id === entry.id)} onChange={() => toggleEntry(entry)}/></td> : null}
          <td><span>{dateOnly(entry.entry_date)}</span><button className="supplier-code" onClick={() => { setLedgerOpen(false); setDetailEntry(entry); }}>{entry.code}</button></td>
          {entriesOnly ? <td className="supplier-entry-name">{entry.supplier_name || suppliers.find((s) => s.id === entry.supplier_id)?.name || "—"}</td> : null}
          <td className="supplier-description">{entry.description}{entry.note ? <small>{entry.note}</small> : null}</td><td>{kindLabels[entry.kind]}</td>
          <td className={`supplier-number ${entry.kind === "decrease" ? "supplier-credit" : ""}`}>{entry.kind === "decrease" ? "−" : "+"}{amountText(entry.amount)}</td>
          <td><span className={`status-badge ${entry.cancelled_at ? "inactive" : entry.payment_id ? "active" : "created"}`}>{entry.cancelled_at ? "Đã hủy" : entry.payment_id ? "Đã thanh toán" : "Chưa thanh toán"}</span></td>
          <td><button className="icon-button" aria-label={`Xem ${entry.code}`} onClick={() => { setLedgerOpen(false); setDetailEntry(entry); }}><Eye size={17}/></button></td>
        </tr>)}</tbody></table> : <table className="data-table standard-list-table"><thead><tr><th>Ngày thanh toán</th><th>Mã đợt</th><th>Số phiếu</th><th>Đã trả</th><th>Phương thức</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}>
          <td>{dateOnly(payment.paid_on)}</td><td><button className="supplier-code" onClick={() => { setLedgerOpen(false); setDetailPayment(payment); }}>{payment.code}</button></td><td>{payment.entries.length}</td><td>{amountText(payment.amount)}</td><td>{payment.method === "cash" ? "Tiền mặt" : "Chuyển khoản"}</td><td>{payment.cancelled_at ? "Đã hoàn tác" : "Đã thanh toán"}</td><td><button className="icon-button" aria-label={`Xem ${payment.code}`} onClick={() => { setLedgerOpen(false); setDetailPayment(payment); }}><Eye size={17}/></button></td>
        </tr>)}</tbody></table>}
        {loading ? <p className="supplier-loading">Đang tải dữ liệu...</p> : total === 0 ? <EmptyState title={tab === "entries" ? "Chưa có phiếu phù hợp" : "Chưa có đợt thanh toán"}/> : null}
      </section>
      <div className="pagination-bar"><span>{total} {tab === "entries" ? "phiếu" : "đợt thanh toán"} · Trang {page}/{Math.max(1, Math.ceil(total / 30))}</span><div className="supplier-actions"><button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Trước</button><button className="secondary-button" disabled={page * 30 >= total || loading} onClick={() => setPage(page + 1)}>Sau</button></div></div>
  </div>;

  return <div className="page-stack supplier-debts-page">
    {!entriesOnly ? <>
    <section className="toolbar supplier-toolbar">
      <div><h2 className="toolbar-title"><Users size={20}/>Nhà cung cấp</h2><span className="field-hint">Khai báo và quản lý thông tin các nhà cung cấp.</span></div>
      <div className="supplier-actions">
        <button className="secondary-button" disabled={supplierLoading || busy} onClick={reload} aria-label="Tải lại nhà cung cấp"><RefreshCw size={16}/></button>
        {canManage ? <button className="primary-button" onClick={() => editSupplier()}><Plus size={16}/>Thêm nhà cung cấp</button> : null}
      </div>
    </section>
    {loadError ? <div className="alert error" role="alert">{loadError}</div> : null}
    <section className="table-panel supplier-table-scroll" aria-busy={supplierLoading}>
      <table className="data-table standard-list-table supplier-management-table"><thead><tr><th>Nhà cung cấp</th><th>Liên hệ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {suppliers.map((s) => <tr key={s.id}><td><button className="supplier-code" onClick={() => viewSupplier(s)}>{s.name}</button>{s.note ? <small className="supplier-note">{s.note}</small> : null}</td><td>{s.phone || "—"}{s.address ? <small className="supplier-contact-address">{s.address}</small> : null}</td>
          <td><span className={`status-badge ${s.is_active ? "active" : "inactive"}`}>{s.is_active ? "Đang sử dụng" : "Ngừng sử dụng"}</span></td>
          <td><div className="supplier-actions"><button className="secondary-button" disabled={busy || supplierLoading} onClick={() => viewSupplier(s)}><Eye size={15}/>Xem</button>{canManage ? <><button className="secondary-button" disabled={busy} onClick={() => editSupplier(s)}><Edit2 size={15}/>Sửa</button><button className="secondary-button" disabled={busy} onClick={() => void toggleSupplier(s)}>{s.is_active ? "Ngừng sử dụng" : "Kích hoạt"}</button></> : null}</div></td>
        </tr>)}
      </tbody></table>
      {supplierLoading ? <p className="supplier-loading">Đang tải nhà cung cấp...</p> : suppliers.length === 0 ? <EmptyState title="Chưa có nhà cung cấp" description={canManage ? "Bấm Thêm nhà cung cấp để tạo đơn vị mới." : undefined}/> : null}
    </section>
    </> : <>
    <section className="toolbar supplier-toolbar">
      <div><h2 className="toolbar-title"><Banknote size={20}/>Danh sách phiếu công nợ</h2><span className="field-hint">Tra cứu phiếu nhập hàng, tăng và giảm công nợ theo nhà cung cấp và thời gian.</span></div>
      <div className="supplier-actions"><button className="secondary-button" aria-label="Tải lại danh sách phiếu" disabled={loading} onClick={reload}><RefreshCw size={16}/></button>{canManage ? <Link className="primary-button" to="/supplier-debts/new"><Plus size={16}/>Nhập phiếu</Link> : null}</div>
    </section>
    <section className="toolbar supplier-entry-filters">
      <label>Nhà cung cấp<select aria-label="Lọc nhà cung cấp" value={supplierId} onChange={(e) => { setSupplierId(Number(e.target.value)); if (!Number(e.target.value)) setTab("entries"); setPage(1); }} disabled={supplierLoading}><option value={0}>Tất cả nhà cung cấp</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? "" : " (ngừng sử dụng)"}</option>)}</select></label>
      {tab === "entries" ? <label>Trạng thái<select aria-label="Lọc trạng thái phiếu" value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}><option value="all">Tất cả trạng thái</option><option value="pending">Chưa thanh toán</option><option value="paid">Đã thanh toán</option><option value="cancelled">Đã hủy</option></select></label> : <div className="field-hint">Lịch sử các đợt thanh toán của nhà cung cấp đã chọn.</div>}
      <div className="supplier-date-filter"><span>{tab === "payments" ? "Ngày thanh toán" : "Ngày lập phiếu"}</span><DateRangePicker from={fromDate} to={toDate} onChange={changeRange}/></div>
    </section>
    {loadError ? <div className="alert error" role="alert">{loadError}</div> : null}
    {tab === "entries" ? <><section className="supplier-entry-stats"><div><span>Tổng tăng công nợ</span><strong>{loading ? "…" : amountText(entrySummary.total_increase)}</strong></div><div><span>Tổng giảm công nợ</span><strong>{loading ? "…" : amountText(entrySummary.total_decrease)}</strong></div><div><span>Chưa thanh toán</span><strong>{loading ? "…" : amountText(entrySummary.pending_amount)}</strong></div></section>
    <p className="field-hint">Tổng tính trên toàn bộ phiếu khớp bộ lọc, loại trừ phiếu đã hủy. {range.from || range.to ? "Đang lọc theo ngày lập phiếu." : "Đang xem tất cả thời gian."}</p></> : null}

    </>}
    {entriesOnly ? ledgerContent : null}
    {detailSupplier ? <Modal title="Thông tin nhà cung cấp" className="supplier-modal supplier-settings-modal" onClose={() => setDetailSupplier(null)}><div className="supplier-detail">
      <h3>{detailSupplier.name}</h3><p><strong>Số điện thoại:</strong> {detailSupplier.phone || "—"}</p><p><strong>Địa chỉ:</strong> {detailSupplier.address || "—"}</p><p className="supplier-note"><strong>Ghi chú:</strong> {detailSupplier.note || "—"}</p><p><strong>Trạng thái:</strong> {detailSupplier.is_active ? "Đang sử dụng" : "Ngừng sử dụng"}</p>
      <div className="form-actions"><button className="secondary-button" onClick={() => setDetailSupplier(null)}>Đóng</button>{canManage ? <button className="primary-button" onClick={() => { editSupplier(detailSupplier); setDetailSupplier(null); }}><Edit2 size={15}/>Sửa nhà cung cấp</button> : null}</div>
    </div></Modal> : null}

    {settingsOpen ? <Modal title={editingSupplierId ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"} className="supplier-modal supplier-settings-modal" onClose={() => closeModal(() => setSettingsOpen(false))}>

      <form className="form-grid" onSubmit={(event) => void saveSupplier(event)}><h3 className="span-2">{editingSupplierId ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}</h3>
        <label>Tên nhà cung cấp<input required maxLength={200} value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}/></label>
        <label>Số điện thoại<input maxLength={30} value={supplierForm.phone || ""} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}/></label>
        <label className="span-2">Địa chỉ<input maxLength={500} value={supplierForm.address || ""} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}/></label>
        <label className="span-2">Ghi chú<textarea maxLength={2000} value={supplierForm.note || ""} onChange={(e) => setSupplierForm({ ...supplierForm, note: e.target.value })}/></label>
        <label className="permission-option span-2"><input type="checkbox" checked={supplierForm.is_active} onChange={(e) => setSupplierForm({ ...supplierForm, is_active: e.target.checked })}/>Đang sử dụng</label>
        <div className="span-2 field-hint">Ngừng sử dụng sẽ ẩn đơn vị khỏi việc lập phiếu mới. Công nợ và lịch sử vẫn được giữ để thanh toán, tra cứu.</div>
        <div className="span-2">{modalAlert}</div><div className="form-actions span-2"><button className="secondary-button" type="button" disabled={busy} onClick={() => setSettingsOpen(false)}>Đóng</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Đang lưu..." : "Lưu nhà cung cấp"}</button></div>
      </form>
    </Modal> : null}

    {editingEntry ? <Modal title={`Sửa ${editingEntry.code}`} className="supplier-modal supplier-entry-modal" onClose={() => closeModal(() => { setEditingEntry(undefined); setLedgerOpen(true); })}>
      <SupplierDebtEntryEditor suppliers={suppliers} entry={editingEntry} onBusyChange={setBusy} onClose={() => { setEditingEntry(undefined); setLedgerOpen(true); }} onSaved={() => { setEditingEntry(undefined); setLedgerOpen(true); setToast("Đã lưu phiếu công nợ."); reload(); }}/>

    </Modal> : null}

    {detailEntry ? <Modal title={`${kindLabels[detailEntry.kind]} · ${detailEntry.code}`} className="supplier-modal supplier-entry-modal" onClose={() => { setDetailEntry(null); setLedgerOpen(true); }}><div className="supplier-detail">
      <p><strong>{detailEntry.supplier_name || suppliers.find((s) => s.id === detailEntry.supplier_id)?.name}</strong> · {dateOnly(detailEntry.entry_date)}</p><h3>{detailEntry.description}</h3><EntryLines entry={detailEntry}/><div className="supplier-form-total"><span>{kindLabels[detailEntry.kind]}</span><strong>{amountText(detailEntry.amount)}</strong></div>
      <p>{detailEntry.cancelled_at ? "Phiếu đã hủy" : detailEntry.payment_id ? `Đã thanh toán · TTNCC-${String(detailEntry.payment_id).padStart(6, "0")}` : "Chưa thanh toán"}</p>
      {auditView}<div className="form-actions">{canManage && !detailEntry.payment_id && !detailEntry.cancelled_at ? <><button className="secondary-button danger" onClick={() => openCancel({ entry: detailEntry })}>Hủy phiếu</button><button className="primary-button" onClick={() => openEntry(detailEntry)}><Edit2 size={16}/>Sửa phiếu</button></> : null}</div>
    </div></Modal> : null}

    {paymentOpen ? <Modal title="Xác nhận thanh toán công nợ" className="supplier-modal supplier-entry-modal" onClose={() => closeModal(() => { setPaymentOpen(false); setLedgerOpen(true); })}>
      <form className="form-grid" onSubmit={(event) => void pay(event)}><p className="span-2"><strong>{suppliers.find((s) => s.id === selected[0]?.supplier_id)?.name}</strong> · {selected.length} phiếu được thanh toán toàn bộ</p>
        <div className="span-2 supplier-payment-lines">{selected.map((entry) => <div key={entry.id}><span>{entry.code} · {entry.description}</span><strong>{amountText(entry.signed_amount)}</strong></div>)}</div>
        <div className="supplier-date-field"><span>Ngày thanh toán</span><DateRangePicker mode="single" ariaLabel="Ngày thanh toán" disabled={busy} from={paidOn} to={paidOn} onChange={(value) => setPaidOn(value)}/></div><label>Phương thức<select value={method} onChange={(e) => setMethod(e.target.value as "cash" | "transfer")}><option value="transfer">Chuyển khoản</option><option value="cash">Tiền mặt</option></select></label>
        <label className="span-2">Ghi chú thanh toán<textarea maxLength={2000} value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)}/></label>
        <div className="supplier-form-total span-2"><span>{Number(selectedTotal) === 0 ? "Bù trừ công nợ" : "Số tiền đã trả"}</span><strong>{amountText(selectedTotal)}</strong></div><p className="field-hint span-2">Chỉ xác nhận sau khi đã trả tiền hoặc đã thống nhất bù trừ với nhà cung cấp.</p>
        <div className="span-2">{modalAlert}</div><div className="form-actions span-2"><button className="secondary-button" type="button" disabled={busy} onClick={() => { setPaymentOpen(false); setLedgerOpen(true); }}>Đóng</button><button className="primary-button" type="submit" disabled={busy || selected.length === 0 || Number(selectedTotal) < 0}>{busy ? "Đang xử lý..." : "Xác nhận đã thanh toán"}</button></div>
      </form>
    </Modal> : null}

    {detailPayment ? <Modal title={`Đợt thanh toán ${detailPayment.code}`} className="supplier-modal supplier-entry-modal" onClose={() => { setDetailPayment(null); setLedgerOpen(true); }}><div className="supplier-detail">
      <p><strong>{detailPayment.supplier_name}</strong> · {dateOnly(detailPayment.paid_on)} · {detailPayment.method === "cash" ? "Tiền mặt" : "Chuyển khoản"}</p><p>Người xác nhận: {detailPayment.created_by_name || "—"}</p>
      <div className="supplier-form-total"><span>Tổng thanh toán</span><strong>{amountText(detailPayment.amount)}</strong></div>
      {detailPayment.note ? <p className="supplier-note">{detailPayment.note}</p> : null}
      {detailPayment.cancelled_at ? <p className="alert error">Đã hoàn tác: {detailPayment.cancel_reason} · {dateTime(detailPayment.cancelled_at)}</p> : null}
      {detailPayment.entries.map((entry) => <details className="supplier-payment-entry" key={entry.id}><summary>{entry.code} · {entry.description} · {amountText(entry.signed_amount)}</summary><EntryLines entry={entry}/></details>)}
      {auditView}{canPay && !detailPayment.cancelled_at ? <div className="form-actions"><button className="secondary-button danger" onClick={() => openCancel({ payment: detailPayment })}><Undo2 size={16}/>Hoàn tác đợt thanh toán</button></div> : null}
    </div></Modal> : null}

    {cancelTarget ? <Modal title={cancelTarget.entry ? `Hủy phiếu ${cancelTarget.entry.code}` : `Hoàn tác ${cancelTarget.payment?.code}`} className="supplier-modal" onClose={() => closeModal(() => { setCancelTarget(null); setLedgerOpen(true); })}><form className="form-grid" onSubmit={(event) => void confirmCancel(event)}>
      <p className="span-2">{cancelTarget.entry ? "Phiếu sẽ được loại khỏi công nợ và vẫn lưu trong lịch sử." : "Toàn bộ phiếu trong đợt sẽ trở về chưa thanh toán và được tính lại vào công nợ."}</p>
      <label className="span-2">Lý do<input required maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}/></label><div className="span-2">{modalAlert}</div>
      <div className="form-actions span-2"><button className="secondary-button" type="button" disabled={busy} onClick={() => { setCancelTarget(null); setLedgerOpen(true); }}>Đóng</button><button className="primary-button" type="submit" disabled={busy || !cancelReason.trim()}>{busy ? "Đang xử lý..." : "Xác nhận"}</button></div>
    </form></Modal> : null}
    {toast ? <ToastNotification title="Công nợ nhà cung cấp" message={toast} onClose={() => setToast("")}/> : null}
  </div>;
}
