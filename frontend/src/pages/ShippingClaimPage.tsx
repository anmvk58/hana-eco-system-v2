import { CheckCircle2, LoaderCircle, PackageCheck, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError, api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ToastNotification } from "../components/ToastNotification";
import type { Invoice } from "../types";
import { dateTime, numberText } from "../utils/format";

export function ShippingClaimPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimedIds, setClaimedIds] = useState<number[]>([]);
  const [toast, setToast] = useState<{ title: string; message: string; variant: "success" | "warning" | "error" } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setInvoices(await api.shipping.availableInvoices()); setSelectedIds([]); }
    catch (err) { setError(err instanceof Error ? err.message : "Không tải được đơn có thể nhận"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function toggle(id: number) { setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); }
  async function claim() {
    if (selectedIds.length === 0) return;
    setClaiming(true); setError(""); setToast(null);
    try {
      const claimed = await api.shipping.claim(selectedIds);
      const nextClaimedIds = claimed.map((invoice) => invoice.id);
      setClaimedIds(nextClaimedIds);
      setSelectedIds([]);
      setToast({ title: "Nhận đơn thành công", message: `Đã nhận ${claimed.length} đơn để chuẩn bị giao.`, variant: "success" });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise((resolve) => window.setTimeout(resolve, 560));
      }
      await load();
      setClaimedIds([]);
    }
    catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await load();
        setToast({ title: "Đơn vừa được nhận", message: `${err.message}. Danh sách đã được làm mới.`, variant: "warning" });
      } else {
        setToast({ title: "Không nhận được đơn", message: err instanceof Error ? err.message : "Không nhận được đơn ship", variant: "error" });
      }
    }
    finally { setClaiming(false); }
  }

  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;
  return <div className="page-stack shipping-claim-page">
    <section className="toolbar shipping-toolbar">
      <div className="shipping-toolbar-copy"><h2 className="toolbar-title"><PackageCheck size={20}/>Đơn chưa audit hôm nay</h2><span className="field-hint">Danh sách được cố định theo ngày tạo hôm nay và tự loại bỏ đơn đã được người khác nhận.</span></div>
      <span className="toolbar-spacer"/>
      <div className="shipping-desktop-actions">
        <button className="secondary-button" disabled={loading || claiming} onClick={() => void load()}><RefreshCw size={17}/>Làm mới</button>
        <button className="primary-button" disabled={selectedIds.length === 0 || claiming} onClick={() => void claim()}>{claiming ? <LoaderCircle className="loading-spinner" size={17}/> : <CheckCircle2 size={17}/>}Nhận {selectedIds.length || ""} đơn</button>
      </div>
    </section>
    {error ? <div className="alert error">{error}</div> : null}
    <section className="table-panel shipping-orders-panel">
      <table className="data-table shipping-desktop-table"><thead><tr><th><input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : invoices.map((item) => item.id))} aria-label="Chọn tất cả"/></th><th>Khách hàng</th><th>Địa chỉ</th><th>Mã hóa đơn</th><th>Thời điểm tạo</th><th className="numeric">Tổng tiền hàng</th><th className="numeric">Tổng thu khác</th><th className="numeric">Tổng thanh toán</th></tr></thead>
      <tbody>{invoices.map((invoice) => <tr key={invoice.id} className={`${selectedIds.includes(invoice.id) ? "selected-row" : ""}${claimedIds.includes(invoice.id) ? " claim-success" : ""}`} onClick={() => toggle(invoice.id)}><td><input type="checkbox" checked={selectedIds.includes(invoice.id)} onChange={() => toggle(invoice.id)} onClick={(event) => event.stopPropagation()} aria-label={`Chọn ${invoice.code}`}/></td><td>{invoice.customer?.name ?? "Khách lẻ"}<span className="table-subtext">{invoice.customer?.phone}</span></td><td>{invoice.customer?.address || "-"}</td><td className="code-cell">{invoice.code}</td><td>{dateTime(invoice.created_at)}</td><td className="numeric">{numberText(invoice.subtotal)}</td><td className="numeric">{numberText(invoice.total_extra_charges)}</td><td className="numeric strong">{numberText(invoice.total_amount)}</td></tr>)}</tbody></table>

      {invoices.length > 0 ? <div className="shipping-mobile-list">
        <label className="shipping-mobile-select-all">
          <input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : invoices.map((item) => item.id))}/>
          <span>Chọn tất cả</span>
          <strong>{selectedIds.length}/{invoices.length} đơn</strong>
        </label>
        {invoices.map((invoice) => {
          const selected = selectedIds.includes(invoice.id);
          return <article
            key={invoice.id}
            className={`shipping-order-card${selected ? " selected" : ""}${claimedIds.includes(invoice.id) ? " claim-success" : ""}`}
            role="checkbox"
            aria-checked={selected}
            tabIndex={0}
            onClick={() => toggle(invoice.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(invoice.id); }
            }}
          >
            <header className="shipping-card-header">
              <input type="checkbox" checked={selected} onChange={() => toggle(invoice.id)} onClick={(event) => event.stopPropagation()} aria-label={`Chọn ${invoice.code}`}/>
              <div className="shipping-card-customer"><strong>{invoice.customer?.name ?? "Khách lẻ"}</strong><span>{invoice.customer?.phone || "Không có số điện thoại"}</span></div>
              <span className="shipping-card-code">{invoice.code}</span>
            </header>
            <div className="shipping-card-address"><span>Địa chỉ giao hàng</span><strong>{invoice.customer?.address || "Chưa có địa chỉ"}</strong></div>
            <div className="shipping-card-totals">
              <div className="shipping-card-grand-total"><span>Thanh toán</span><strong>{numberText(invoice.total_amount)}</strong></div>
            </div>
          </article>;
        })}
      </div> : null}
      {!loading && invoices.length === 0 ? <EmptyState title="Không còn đơn để nhận" description="Chỉ hiển thị hóa đơn chưa audit được tạo trong hôm nay."/> : null}
      {loading ? <EmptyState title="Đang tải đơn hôm nay"/> : null}
    </section>
    <div className="shipping-mobile-actions" aria-label="Thao tác nhận đơn">
      <button className="secondary-button shipping-mobile-refresh" disabled={loading || claiming} onClick={() => void load()} aria-label="Làm mới danh sách"><RefreshCw size={19}/></button>
      <button className="primary-button shipping-mobile-claim" disabled={selectedIds.length === 0 || claiming} onClick={() => void claim()}>{claiming ? <LoaderCircle className="loading-spinner" size={18}/> : <CheckCircle2 size={18}/>}<span>{selectedIds.length > 0 ? `Nhận ${selectedIds.length} đơn` : "Chọn đơn để nhận"}</span></button>
    </div>
    {toast ? <ToastNotification title={toast.title} message={toast.message} variant={toast.variant} duration={3200} onClose={() => setToast(null)} /> : null}
  </div>;
}
