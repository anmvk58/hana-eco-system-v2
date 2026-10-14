import { CreditCard, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./Modal";
import { money } from "../utils/format";

type TransferInvoice = {
  id: number;
  code: string;
  total_amount: string | number;
  revision?: number;
  is_paid_by_transfer: boolean;
  status?: string;
  audit_label?: string | null;
  customer?: { name: string } | null;
  customer_name?: string | null;
  is_cod_pending?: boolean;
};

export function TransferPaymentButton({ invoice, disabled = false, variant = "compact", externalBatchId, onBusyChange, onChanged }: {
  invoice: TransferInvoice;
  disabled?: boolean;
  variant?: "compact" | "invoice-list";
  externalBatchId?: number;
  onBusyChange?: (busy: boolean) => void;
  onChanged: () => void | Promise<void>;
}) {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  if (externalBatchId !== undefined ? !hasPermission("order_reconciliation.manage") : !hasPermission("invoices.update") && !hasPermission("order_reconciliation.manage")) return null;
  if (invoice.is_paid_by_transfer) return <span className="payment-chip transfer"><CreditCard size={14}/>Đã chuyển khoản</span>;
  if (invoice.status === "cancelled") return null;
  const external = invoice.audit_label === "external_shipper" && externalBatchId === undefined;
  const buttonClass = variant === "invoice-list"
    ? "invoice-list-action-button invoice-list-edit-button transfer-payment-button"
    : "secondary-button compact-button transfer-payment-button";
  function close() {
    if (saving) return;
    setOpen(false);
    onBusyChange?.(false);
  }
  async function confirm() {
    setSaving(true);
    setError("");
    try {
      if (externalBatchId !== undefined) {
        await api.orderReconciliation.confirmExternalTransfer(externalBatchId, invoice.id, invoice.total_amount, invoice.revision, note.trim() || undefined);
      } else {
        await api.invoices.confirmTransfer(invoice.id, invoice.total_amount, invoice.revision, note.trim() || undefined);
      }
      setSuccess(true);
      await onChanged();
      setOpen(false);
      onBusyChange?.(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật thanh toán");
    } finally { setSaving(false); }
  }
  return <>
    <button className={buttonClass} type="button" aria-label={`Đánh dấu ${invoice.code} đã chuyển khoản`} disabled={disabled || external || saving} title={external ? "Cần điều chỉnh bảng giao Ship Ngoài trước khi đổi thanh toán" : "Đánh dấu đã chuyển khoản — xác nhận shop đã nhận đủ tiền"} onClick={() => { setNote(""); setError(""); setSuccess(false); setOpen(true); onBusyChange?.(true); }}><CreditCard size={16} aria-hidden="true"/></button>
    {open ? createPortal(<Modal title={`Đánh dấu ${invoice.code} đã chuyển khoản?`} onClose={close}>
      <div className="transfer-payment-confirmation">
        <p>{invoice.customer?.name || invoice.customer_name || "Khách lẻ"} · <strong>{money(invoice.total_amount)}</strong></p>
        <p>Xác nhận shop đã nhận đủ tiền của đơn này.</p>
        {invoice.audit_label === "internal_shipper" || invoice.is_cod_pending ? <p>COD cần thu từ shipper giảm <strong>{money(invoice.total_amount)}</strong>.</p> : null}
        {externalBatchId !== undefined ? <p>Tiền phải nhận từ shipper của phiên giảm <strong>{money(invoice.total_amount)}</strong>. Tiền thực tế đã nhận và phí ship giữ nguyên để đối chiếu.</p> : null}
        <p>Đơn vẫn cần được xác nhận tại bước kiểm kê tiền.</p>
        <label>Ghi chú / mã giao dịch (tùy chọn)<textarea maxLength={500} value={note} disabled={saving || success} onChange={(event) => setNote(event.target.value)}/></label>
        {success ? <p role="status">Đã ghi nhận chuyển khoản.</p> : null}
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <div className="modal-actions"><button className="secondary-button" type="button" disabled={saving} onClick={close}>Quay lại</button><button className="primary-button" type="button" disabled={saving || success} onClick={() => void confirm()}>{saving ? <LoaderCircle size={16} className="loading-spinner"/> : <CreditCard size={16}/>}Xác nhận đã chuyển khoản</button></div>
      </div>
    </Modal>, document.body) : null}
  </>;
}
