import { ArrowLeft, BadgeCheck, Edit, Printer, RotateCcw, Store, Truck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { InvoiceReceipt } from "../components/InvoiceReceipt";
import { StatusBadge } from "../components/StatusBadge";
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
        </div> : <span className="field-hint">{invoice.audit_label ? "Hóa đơn đã được audit." : "Đơn Ship Ruột sẽ được gán khi shipper nhận đơn."}</span>}
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
    </div>
  );
}
