import { Edit, Printer, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import type { Invoice, InvoiceHistory } from "../types";
import { dateTime, money } from "../utils/format";

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const id = Number(invoiceId);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [history, setHistory] = useState<InvoiceHistory[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const [invoiceData, historyData] = await Promise.all([api.invoices.get(id), api.invoices.history(id)]);
      setInvoice(invoiceData);
      setHistory(historyData);
    }
    void load().catch((err) => setError(err instanceof Error ? err.message : "Không tải được hóa đơn"));
  }, [id]);

  function printInvoice() {
    window.print();
  }

  if (error) return <div className="alert error">{error}</div>;
  if (!invoice) return <EmptyState title="Đang tải hóa đơn" />;

  return (
    <div className="page-stack invoice-detail">
      <section className="detail-header">
        <div>
          <h2>{invoice.code}</h2>
          <span>{dateTime(invoice.sold_at)} · {invoice.customer?.name ?? "Khách lẻ"}</span>
        </div>
        <div className="detail-actions">
          <StatusBadge status={invoice.status} />
          <Link className="secondary-button link-button" to={`/invoices/${invoice.id}/edit`}>
            <Edit size={16} />
            Sửa
          </Link>
          <button className="primary-button" type="button" onClick={printInvoice}>
            <Printer size={16} />
            In hóa đơn
          </button>
        </div>
      </section>

      <section className="print-area">
        <div className="receipt-heading">
          <h2>HANA SHOP</h2>
          <span>Hóa đơn bán hàng</span>
        </div>
        <div className="receipt-meta">
          <div>
            <span>Mã hóa đơn</span>
            <strong>{invoice.code}</strong>
          </div>
          <div>
            <span>Khách hàng</span>
            <strong>{invoice.customer?.name ?? "Khách lẻ"}</strong>
          </div>
          <div>
            <span>Số điện thoại</span>
            <strong>{invoice.customer?.phone ?? ""}</strong>
          </div>
          <div>
            <span>Ngày bán</span>
            <strong>{dateTime(invoice.sold_at)}</strong>
          </div>
        </div>
        <table className="data-table receipt-table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>SL</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>{item.product_code} - {item.product_name}</td>
                <td className="numeric">{item.quantity}</td>
                <td className="numeric">{money(item.unit_price)}</td>
                <td className="numeric">{money(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="receipt-total">
          <div><span>Tổng tiền hàng</span><strong>{money(invoice.subtotal)}</strong></div>
          {invoice.extra_charges.map((charge) => (
            <div key={charge.id}><span>{charge.name}</span><strong>{money(charge.amount)}</strong></div>
          ))}
          <div className="summary-total"><span>Tổng thanh toán</span><strong>{money(invoice.total_amount)}</strong></div>
        </div>
      </section>

      <section className="history-panel">
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
      </section>
    </div>
  );
}

