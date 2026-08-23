import { AlertTriangle, ArrowLeft, BadgeCheck, Edit, Printer, RotateCcw, Store, Truck, XCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { InvoiceReceipt } from "../components/InvoiceReceipt";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { ToastNotification } from "../components/ToastNotification";
import { AuditBadge } from "../components/AuditBadge";
import type { InvoiceAuditLabel } from "../types";
import type { Invoice, InvoiceHistory } from "../types";
import { dateTime, utcDateTime } from "../utils/format";

export function InvoiceDetailPage() {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const { invoiceId } = useParams();
  const id = Number(invoiceId);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [history, setHistory] = useState<InvoiceHistory[]>([]);
  const [error, setError] = useState("");
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackError, setRollbackError] = useState("");
  const [rollingBack, setRollingBack] = useState(false);
  const [toast, setToast] = useState("");
  const navigationState = location.state as { invoiceListSearch?: string; returnTo?: string } | null;
  const invoiceListSearch = navigationState?.invoiceListSearch;
  const invoiceListPath = navigationState?.returnTo ?? (invoiceListSearch ? `/invoices?${invoiceListSearch}` : "/invoices");

  useEffect(() => {
    async function load() {
      const [invoiceData, historyData] = await Promise.all([api.invoices.get(id), hasPermission("invoices.history") ? api.invoices.history(id) : Promise.resolve([])]);
      setInvoice(invoiceData);
      setHistory(historyData);
    }
    void load().catch((err) => setError(err instanceof Error ? err.message : "Không tải được hóa đơn"));
  }, [id, hasPermission]);

  function printInvoice() {
    window.print();
  }

  async function cancelInvoice() {
    if (!invoice) return;
    const reason = window.prompt(`Lý do hủy hóa đơn ${invoice.code}`, "Khách hủy đơn");
    if (reason === null) return;
    if (!reason.trim()) { setError("Vui lòng nhập lý do hủy hóa đơn"); return; }
    try {
      setInvoice(await api.invoices.cancel(invoice.id, reason.trim()));
      if (hasPermission("invoices.history")) setHistory(await api.invoices.history(invoice.id));
    } catch (err) { setError(err instanceof Error ? err.message : "Không hủy được hóa đơn"); }
  }

  async function assignAuditLabel(label: Exclude<InvoiceAuditLabel, "internal_shipper">) {
    if (!invoice) return;
    setError("");
    try {
      setInvoice(await api.invoices.audit(invoice.id, label));
      if (hasPermission("invoices.history")) setHistory(await api.invoices.history(invoice.id));
    } catch (err) { setError(err instanceof Error ? err.message : "Không gán được nhãn audit"); }
  }

  async function rollbackAudit(event: FormEvent) {
    event.preventDefault();
    if (!invoice || !rollbackReason.trim()) return;
    setRollbackError("");
    setRollingBack(true);
    try {
      const updated = await api.invoices.rollbackAudit(invoice.id, rollbackReason.trim());
      setInvoice(updated);
      if (hasPermission("invoices.history")) setHistory(await api.invoices.history(invoice.id));
      setRollbackOpen(false);
      setRollbackReason("");
      setRollbackError("");
      setToast(`${updated.code} đã trở về trạng thái Chưa Audit.`);
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : "Không hoàn tác được nhãn Audit");
    } finally {
      setRollingBack(false);
    }
  }

  if (!invoice) return error ? <div className="alert error">{error}</div> : <EmptyState title="Đang tải hóa đơn" />;

  const customerName = invoice.customer?.name ?? "Khách lẻ";
  return (
    <div className="page-stack invoice-detail">
      {error ? <div className="alert error">{error}</div> : null}
      <section className="detail-header">
        <div>
          <Link className="secondary-button link-button invoice-detail-back" to={invoiceListPath}>
            <ArrowLeft size={16} />
            Quay lại danh sách
          </Link>
          <h2>{invoice.code}</h2>
          <span>{dateTime(invoice.sold_at)} · {customerName}</span>
        </div>
        <div className="detail-actions">
          <StatusBadge status={invoice.status} />
          <AuditBadge label={invoice.audit_label} />
          {invoice.is_paid_by_transfer ? <span className="invoice-payment-badge"><BadgeCheck size={16}/>Đã thanh toán chuyển khoản</span> : null}
          {hasPermission("invoices.update") && invoice.status === "created" ? <Link className="secondary-button link-button" to={`/invoices/${invoice.id}/edit`}>
            <Edit size={16} />
            Sửa
          </Link> : null}
          {hasPermission("invoices.cancel") && invoice.status === "created" ? <button className="secondary-button danger-button" type="button" onClick={() => void cancelInvoice()}><XCircle size={16}/>Hủy hóa đơn</button> : null}
          {hasPermission("invoices.print") ? <button className="primary-button" type="button" onClick={printInvoice}>
            <Printer size={16} />
            In hóa đơn
          </button> : null}
        </div>
      </section>

      <section className="audit-panel">
        <div>
          <span className="field-hint">Nhãn audit giao nhận</span>
          <div className="audit-panel-value"><AuditBadge label={invoice.audit_label} />{invoice.assigned_shipper ? <strong>{invoice.assigned_shipper.user.display_name}</strong> : null}</div>
        </div>
        {!invoice.audit_label && invoice.status === "created" && hasPermission("invoices.audit") ? <div className="detail-actions">
          <button className="secondary-button" type="button" onClick={() => void assignAuditLabel("retail")}><Store size={16}/>Khách lẻ</button>
          <button className="secondary-button" type="button" onClick={() => void assignAuditLabel("external_shipper")}><Truck size={16}/>Ship Ngoài</button>
        </div> : invoice.audit_label && invoice.audit_label !== "internal_shipper" && hasPermission("invoices.audit") ? <div className="audit-rollback-actions">
          <span className="field-hint">Hóa đơn đã được Audit.</span>
          <button className="secondary-button danger-button" type="button" onClick={() => { setRollbackError(""); setRollbackOpen(true); }}><RotateCcw size={16}/>Hoàn tác Audit</button>
        </div> : <span className="field-hint">{invoice.audit_label ? "Đơn Ship nội bộ cần thu hồi tại màn hình bàn giao." : "Đơn Ship Ruột sẽ được gán khi shipper nhận đơn."}</span>}
      </section>

      <InvoiceReceipt invoice={invoice} />

      {hasPermission("invoices.history") ? <section className="history-panel">
        <div className="panel-header">
          <div>
            <h2>Lịch sử chỉnh sửa</h2>
            <span>Ghi nhận dữ liệu trước và sau mỗi lần thay đổi</span>
          </div>
          <RotateCcw size={20} />
        </div>
        <div className="history-list">
          {history.map((item) => (
            <article key={item.id} className="history-item">
              <div>
                <strong>{item.action}</strong>
                <span>{utcDateTime(item.created_at)} · {item.changed_by_name ?? "Không rõ người sửa"}</span>
              </div>
              <p>{item.reason || "Không có lý do"}</p>
              <details>
                <summary>Xem snapshot</summary>
                <pre>{JSON.stringify({ before: item.before_data, after: item.after_data }, null, 2)}</pre>
              </details>
            </article>
          ))}
        </div>
      </section> : null}

      {rollbackOpen ? <Modal title={`Hoàn tác Audit ${invoice.code}`} className="invoice-audit-rollback-modal" onClose={() => { if (!rollingBack) { setRollbackOpen(false); setRollbackReason(""); setRollbackError(""); } }}>
        <form className="invoice-audit-rollback-form" onSubmit={(event) => void rollbackAudit(event)}>
          <div className="invoice-audit-rollback-summary">
            <RotateCcw size={23}/>
            <div><small>Nhãn hiện tại</small><strong><AuditBadge label={invoice.audit_label}/></strong><span>{invoice.customer?.name || "Khách lẻ"}</span></div>
          </div>
          <div className="invoice-audit-rollback-warning"><AlertTriangle size={19}/><span>Hóa đơn sẽ quay về <strong>Chưa Audit</strong> để có thể gán lại đúng nhãn. Không thể hoàn tác nếu đơn đã được kiểm kê, thu tiền hoặc đang thuộc một phiên bàn giao.</span></div>
          {rollbackError ? <div className="alert error">{rollbackError}</div> : null}
          <label>Lý do hoàn tác<textarea required autoFocus maxLength={500} rows={3} value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} placeholder="Ví dụ: Bấm nhầm Khách lẻ, cần bàn giao cho shipper..."/></label>
          <div className="form-actions">
            <button className="secondary-button" type="button" disabled={rollingBack} onClick={() => { setRollbackOpen(false); setRollbackReason(""); setRollbackError(""); }}>Hủy</button>
            <button className="primary-button danger-confirm-button" type="submit" disabled={rollingBack || !rollbackReason.trim()}><RotateCcw size={16}/>{rollingBack ? "Đang hoàn tác..." : "Xác nhận hoàn tác"}</button>
          </div>
        </form>
      </Modal> : null}

      {toast ? <ToastNotification title="Hoàn tác Audit thành công" message={toast} duration={3600} onClose={() => setToast("")}/> : null}
    </div>
  );
}
