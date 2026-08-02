import { BadgeCheck, Ban, CheckCircle2, Clock3, HandCoins, History, ListFilter, LoaderCircle, Phone, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError, api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { ToastNotification } from "../components/ToastNotification";
import type { Invoice } from "../types";
import { dateTime, money, todayInputValue } from "../utils/format";

type DeliveryFilter = "pending" | "delivered" | "all" | "cancelled";

export function ShippingReceivedPage() {
  const today = todayInputValue();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("all");
  const [deliveringId, setDeliveringId] = useState<number | null>(null);
  const [deliveryConfirmation, setDeliveryConfirmation] = useState<Invoice | null>(null);
  const [deliverySuccessId, setDeliverySuccessId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ title: string; message: string; variant: "success" | "warning" | "error" } | null>(null);
  const [error, setError] = useState("");

  async function load(from: string, to: string) {
    setLoading(true);
    setError("");
    try {
      setInvoices(await api.shipping.claimedInvoices(from, to));
    } catch (err) {
      setInvoices([]);
      setError(err instanceof Error ? err.message : "Không tải được danh sách đơn đã nhận");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(fromDate, toDate);
  }, [fromDate, toDate]);

  function changeDateRange(from: string, to: string) {
    setFromDate(from);
    setToDate(to);
  }

  async function markDelivered(invoice: Invoice) {
    if (invoice.delivered_at || invoice.status === "cancelled" || deliveringId !== null) return;
    setDeliveringId(invoice.id);
    setToast(null);
    try {
      const updated = await api.shipping.markDelivered(invoice.id);
      setInvoices((items) => items.map((item) => item.id === updated.id ? updated : item));
      setDeliverySuccessId(invoice.id);
      setToast({ title: "Giao hàng thành công", message: `Đã xác nhận giao thành công đơn ${invoice.code}.`, variant: "success" });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise((resolve) => window.setTimeout(resolve, 620));
      }
      setDeliverySuccessId(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await load(fromDate, toDate);
        setToast({ title: "Không thể cập nhật", message: `${err.message}. Danh sách đã được làm mới.`, variant: "warning" });
      } else {
        setToast({ title: "Không thể xác nhận giao hàng", message: err instanceof Error ? err.message : "Vui lòng thử lại", variant: "error" });
      }
    } finally {
      setDeliveringId(null);
    }
  }

  function requestDeliveryConfirmation(invoice: Invoice) {
    if (invoice.delivered_at || invoice.status === "cancelled" || deliveringId !== null) return;
    setDeliveryConfirmation(invoice);
  }

  function confirmDelivery() {
    if (!deliveryConfirmation || deliveringId !== null) return;
    const invoice = deliveryConfirmation;
    setDeliveryConfirmation(null);
    void markDelivered(invoice);
  }

  const filteredInvoices = invoices.filter((invoice) => {
    if (deliveryFilter === "pending") return !invoice.delivered_at && invoice.status !== "cancelled";
    if (deliveryFilter === "delivered") return Boolean(invoice.delivered_at) && invoice.status !== "cancelled";
    if (deliveryFilter === "cancelled") return invoice.status === "cancelled";
    return true;
  });
  const totalCollectionAmount = filteredInvoices.reduce(
    (sum, invoice) => sum + (invoice.is_paid_by_transfer ? 0 : Number(invoice.total_amount)),
    0,
  );

  return <div className="page-stack shipping-received-page">
    <section className="toolbar shipping-toolbar shipping-received-toolbar">
      <div className="shipping-toolbar-copy">
        <h2 className="toolbar-title"><History size={20}/>Đơn đã nhận</h2>
        <span className="field-hint">Chỉ hiển thị các đơn do chính tài khoản shipper này nhận trong khoảng ngày đã chọn.</span>
      </div>
      <span className="toolbar-spacer"/>
      <div className="shipping-received-controls">
        <DateRangePicker from={fromDate} to={toDate} onChange={changeDateRange}/>
        <button className="secondary-button shipping-received-refresh" type="button" disabled={loading} onClick={() => void load(fromDate, toDate)} aria-label="Làm mới danh sách">
          {loading ? <LoaderCircle className="loading-spinner" size={17}/> : <RefreshCw size={17}/>}<span>Làm mới</span>
        </button>
      </div>
      <div className="shipping-status-filter" role="group" aria-label="Lọc trạng thái giao hàng">
        <button className={`shipping-filter-button all${deliveryFilter === "all" ? " active" : ""}`} type="button" onClick={() => setDeliveryFilter("all")} aria-pressed={deliveryFilter === "all"}><ListFilter size={18}/><span>Tất cả</span></button>
        <button className={`shipping-filter-button pending${deliveryFilter === "pending" ? " active" : ""}`} type="button" onClick={() => setDeliveryFilter("pending")} aria-pressed={deliveryFilter === "pending"}><Clock3 size={18}/><span>Đang giao</span></button>
        <button className={`shipping-filter-button delivered${deliveryFilter === "delivered" ? " active" : ""}`} type="button" onClick={() => setDeliveryFilter("delivered")} aria-pressed={deliveryFilter === "delivered"}><CheckCircle2 size={18}/><span>Đã giao</span></button>
        <button className={`shipping-filter-button cancelled${deliveryFilter === "cancelled" ? " active" : ""}`} type="button" onClick={() => setDeliveryFilter("cancelled")} aria-pressed={deliveryFilter === "cancelled"}><Ban size={18}/><span>Hủy</span></button>
      </div>
    </section>

    {error ? <div className="alert error">{error}</div> : null}

    {!loading && !error && filteredInvoices.length > 0 ? <section className="shipping-received-summary" aria-label="Tổng hợp đơn đã nhận">
      <div><span>Số đơn</span><strong>{filteredInvoices.length}</strong></div>
      <div><span>Tổng COD</span><strong>{money(totalCollectionAmount)}</strong></div>
    </section> : null}

    <section className="table-panel shipping-orders-panel">
      <table className="data-table shipping-desktop-table">
        <thead><tr><th>Khách hàng</th><th>Địa chỉ</th><th>Mã hóa đơn</th><th>Thời điểm nhận</th><th>Trạng thái</th><th>Giao hàng</th><th className="numeric">Tổng tiền hàng</th><th className="numeric">Tổng thu khác</th><th className="numeric">Tổng thanh toán</th></tr></thead>
        <tbody>{filteredInvoices.map((invoice) => <tr key={invoice.id} className={deliverySuccessId === invoice.id ? "delivery-success" : ""}>
          <td>{invoice.customer?.name ?? "Khách lẻ"}<span className="table-subtext">{invoice.customer?.phone}</span></td>
          <td>{invoice.customer?.address || "-"}</td>
          <td className="code-cell">{invoice.code}</td>
          <td>{dateTime(invoice.audited_at)}</td>
          <td><StatusBadge status={invoice.status}/></td>
          <td>{invoice.delivered_at
            ? <span className="delivery-status delivered"><CheckCircle2 size={14}/>Đã giao<span className="table-subtext">{dateTime(invoice.delivered_at)}</span></span>
            : invoice.status === "cancelled"
              ? <button className="primary-button shipping-deliver-button" type="button" disabled><Ban size={15}/>Đơn đã hủy</button>
              : <div className="shipping-delivery-actions desktop-actions">
                <button className="primary-button shipping-deliver-button" type="button" disabled={deliveringId !== null} onClick={() => requestDeliveryConfirmation(invoice)}>{deliveringId === invoice.id ? <LoaderCircle className="loading-spinner" size={15}/> : <CheckCircle2 size={15}/>}Đã giao</button>
                {invoice.customer?.phone
                  ? <a className="primary-button shipping-call-button" href={`tel:${invoice.customer.phone}`} aria-label={`Gọi ${invoice.customer.name}`}><Phone size={15}/><span>Gọi điện</span></a>
                  : <button className="primary-button shipping-call-button" type="button" disabled title="Khách hàng chưa có số điện thoại"><Phone size={15}/><span>Gọi điện</span></button>}
              </div>}
          </td>
          <td className="numeric">{money(invoice.subtotal)}</td>
          <td className="numeric">{money(invoice.total_extra_charges)}</td>
          <td className="numeric strong">{invoice.is_paid_by_transfer
            ? <span className="shipping-payment-status paid"><BadgeCheck size={15}/><strong>Đã thanh toán</strong><small>Không thu tiền khách</small></span>
            : <span className="shipping-payment-status collect"><HandCoins size={15}/><strong>{money(invoice.total_amount)}</strong><small>Cần thu khách</small></span>}
          </td>
        </tr>)}</tbody>
      </table>

      {filteredInvoices.length > 0 ? <div className="shipping-mobile-list">
        {filteredInvoices.map((invoice) => <article className={`shipping-order-card received-shipment-card ${invoice.status === "cancelled" ? "is-cancelled" : invoice.delivered_at ? "is-delivered" : "is-in-delivery"}${deliverySuccessId === invoice.id ? " delivery-success" : ""}`} key={invoice.id}>
          <header className="shipping-card-header">
            <div className="shipping-card-customer"><strong>{invoice.customer?.name ?? "Khách lẻ"}</strong><span>{invoice.customer?.phone || "Không có số điện thoại"}</span></div>
            <span className="shipping-card-code">{invoice.code}</span>
          </header>
          <div className="shipping-received-meta">
            <span>Nhận lúc {dateTime(invoice.audited_at)}</span>
            <StatusBadge status={invoice.status}/>
          </div>
          <div className="shipping-card-address"><span>Địa chỉ giao hàng</span><strong>{invoice.customer?.address || "Chưa có địa chỉ"}</strong></div>
          <div className="shipping-card-footer">
            <div className={`shipping-card-payment${invoice.is_paid_by_transfer ? " paid" : " collect"}`}>
              {invoice.is_paid_by_transfer ? <BadgeCheck size={19}/> : <HandCoins size={19}/>}
              <span>
                <small>{invoice.is_paid_by_transfer ? "Đã chuyển khoản" : "COD cần thu"}</small>
                <strong>{invoice.is_paid_by_transfer ? "Không thu" : money(invoice.total_amount)}</strong>
              </span>
            </div>
            <div className={`shipping-delivery-state${invoice.delivered_at ? " delivered" : ""}`}>
              {invoice.delivered_at
                ? <><CheckCircle2 size={19}/><span><strong>Đã giao</strong><small>{dateTime(invoice.delivered_at)}</small></span></>
                : invoice.status === "cancelled"
                  ? <button className="primary-button" type="button" disabled><Ban size={17}/><span>Đơn đã hủy</span></button>
                  : <div className="shipping-delivery-actions">
                    <button className="primary-button" type="button" disabled={deliveringId !== null} onClick={() => requestDeliveryConfirmation(invoice)}>{deliveringId === invoice.id ? <LoaderCircle className="loading-spinner" size={17}/> : <CheckCircle2 size={17}/>}<span>Đã giao</span></button>
                    {invoice.customer?.phone
                      ? <a className="primary-button shipping-call-button" href={`tel:${invoice.customer.phone}`} aria-label={`Gọi ${invoice.customer.name}`}><Phone size={17}/><span>Gọi điện</span></a>
                      : <button className="primary-button shipping-call-button" type="button" disabled title="Khách hàng chưa có số điện thoại"><Phone size={17}/><span>Gọi điện</span></button>}
                  </div>}
            </div>
          </div>
        </article>)}
      </div> : null}

      {!loading && !error && filteredInvoices.length === 0 ? <EmptyState title="Không có đơn phù hợp" description="Không có đơn nào khớp trạng thái và khoảng ngày đã chọn."/> : null}
      {loading ? <EmptyState title="Đang tải đơn đã nhận"/> : null}
    </section>
    {deliveryConfirmation ? <Modal title="Xác nhận đã giao hàng" onClose={() => setDeliveryConfirmation(null)}>
      <div className="delivery-confirmation">
        <p>Bạn có chắc chắn muốn đánh dấu đơn <strong>{deliveryConfirmation.code}</strong> là đã giao?</p>
        <dl>
          <div><dt>Khách hàng</dt><dd>{deliveryConfirmation.customer?.name ?? "Khách lẻ"}</dd></div>
          <div><dt>Địa chỉ giao hàng</dt><dd>{deliveryConfirmation.customer?.address || "Chưa có địa chỉ"}</dd></div>
          <div><dt>Tổng thanh toán</dt><dd>{money(deliveryConfirmation.total_amount)}</dd></div>
        </dl>
        <p className="field-hint">Sau khi xác nhận, trạng thái giao hàng của đơn sẽ được cập nhật ngay.</p>
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={() => setDeliveryConfirmation(null)}>Hủy</button>
          <button className="primary-button" type="button" onClick={confirmDelivery}><CheckCircle2 size={16}/>Xác nhận đã giao</button>
        </div>
      </div>
    </Modal> : null}
    {toast ? <ToastNotification title={toast.title} message={toast.message} variant={toast.variant} duration={3200} onClose={() => setToast(null)}/> : null}
  </div>;
}
