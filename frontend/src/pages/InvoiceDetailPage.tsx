import { Edit, Printer, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { InvoiceReceipt } from "../components/InvoiceReceipt";
import { StatusBadge } from "../components/StatusBadge";
import type { Invoice, InvoiceHistory } from "../types";
import { dateTime } from "../utils/format";

export function InvoiceDetailPage() {
  const { hasPermission } = useAuth();
  const { invoiceId } = useParams();
  const id = Number(invoiceId);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [history, setHistory] = useState<InvoiceHistory[]>([]);
  const [error, setError] = useState("");

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

  if (error) return <div className="alert error">{error}</div>;
  if (!invoice) return <EmptyState title="Đang tải hóa đơn" />;

  const customerName = invoice.customer?.name ?? "Khách lẻ";
  return (
    <div className="page-stack invoice-detail">
      <section className="detail-header">
        <div>
          <h2>{invoice.code}</h2>
          <span>{dateTime(invoice.sold_at)} · {customerName}</span>
        </div>
        <div className="detail-actions">
          <StatusBadge status={invoice.status} />
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
                <span>{dateTime(item.created_at)} · {item.changed_by_name ?? "Không rõ người sửa"}</span>
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
