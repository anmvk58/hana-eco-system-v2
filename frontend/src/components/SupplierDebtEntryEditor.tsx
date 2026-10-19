import { DateRangePicker } from "./DateRangePicker";
import { FormSelect } from "./FormSelect";
import { Building2, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { supplierLineTotal, supplierSum } from "../features/supplierDebt";
import type { Supplier, SupplierDebtEntry, SupplierDebtEntryPayload, SupplierDebtKind } from "../types";
import { todayInputValue } from "../utils/format";

const amountText = (amount: string | number) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(amount))} ₫`;
const emptyEntry = (supplier_id: number, kind: SupplierDebtKind): SupplierDebtEntryPayload => ({
  supplier_id, kind, entry_date: todayInputValue(), description: kind === "purchase" ? "Nhập hàng" : "", note: "", amount: "",
  items: kind === "purchase" ? [{ name: "", quantity: "1", unit_price: "" }] : [],
});

export function SupplierDebtEntryEditor({ suppliers, entry, defaultSupplierId = 0, onSaved, onClose, onBusyChange }: {
  suppliers: Supplier[]; entry?: SupplierDebtEntry; defaultSupplierId?: number;
  onSaved: (entry: SupplierDebtEntry) => void; onClose?: () => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [entryForm, setEntryForm] = useState<SupplierDebtEntryPayload>(() => entry ? {
    supplier_id: entry.supplier_id, kind: entry.kind, entry_date: entry.entry_date, description: entry.description,
    note: entry.note, amount: entry.amount, items: entry.items.map(({ name, quantity, unit_price }) => ({ name, quantity, unit_price })),
  } : emptyEntry(defaultSupplierId, "purchase"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    onBusyChange?.(busy);
    return () => { onBusyChange?.(false); };
  }, [busy, onBusyChange]);
  const entryTotal = entryForm.kind === "purchase" ? supplierSum(entryForm.items.map((item) => supplierLineTotal(item.quantity, item.unit_price))) : entryForm.amount || "0";
  const modalAlert = error ? <div className="alert error" role="alert">{error}</div> : null;
  async function saveEntry(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const saved = await api.supplierDebts.saveEntry(entryForm.kind === "purchase" ? { ...entryForm, amount: undefined } : entryForm, entry);
      if (!entry) setEntryForm({ ...emptyEntry(entryForm.supplier_id, entryForm.kind), entry_date: entryForm.entry_date });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 422 && err.message === "HTTP 422"
        ? "Dữ liệu chưa hợp lệ. Kiểm tra tên hàng, ngày, số lượng (tối đa 3 số lẻ) và số tiền (tối đa 2 số lẻ)."
        : err instanceof Error ? err.message : "Không lưu được phiếu công nợ.");
    } finally { setBusy(false); }
  }
  return (
      <form className="form-grid supplier-entry-form" onSubmit={(event) => void saveEntry(event)}>
        <FormSelect label="Nhà cung cấp" icon={Building2} required searchable placeholder="Chọn nhà cung cấp" value={entryForm.supplier_id ? String(entryForm.supplier_id) : ""} disabled={!!entry || busy} options={suppliers.filter((s) => s.is_active || s.id === entry?.supplier_id).map((s) => ({ value: String(s.id), label: `${s.name}${s.is_active ? "" : " (ngừng sử dụng)"}` }))} onChange={(value) => setEntryForm({ ...entryForm, supplier_id: Number(value) })}/>
        <div className="supplier-date-field"><span>Ngày phiếu</span><DateRangePicker mode="single" ariaLabel="Ngày phiếu" disabled={busy} from={entryForm.entry_date} to={entryForm.entry_date} onChange={(value) => setEntryForm({ ...entryForm, entry_date: value })}/></div>
        <FormSelect label="Loại phiếu" icon={ReceiptText} value={entryForm.kind} disabled={!!entry || busy} options={[
          { value: "purchase", label: "Phiếu nhập hàng", description: "Nhập tên hàng, số lượng và đơn giá" },
          { value: "increase", label: "Tăng công nợ", description: "Ghi nhận phí ship và khoản phải trả thêm" },
          { value: "decrease", label: "Giảm công nợ", description: "Ghi nhận hàng trả và khoản được giảm" },
        ]} onChange={(value) => setEntryForm({ ...emptyEntry(entryForm.supplier_id, value as SupplierDebtKind), entry_date: entryForm.entry_date })}/>
        {entryForm.kind !== "purchase" ? <label>Số tiền<input type="number" min="0.01" max="999999999999.99" step="0.01" required value={entryForm.amount || ""} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })}/></label> : null}
        {entryForm.kind === "purchase" ? <section className="span-2 supplier-line-editor" aria-label="Các mặt hàng nhập">
          {entryForm.items.map((item, index) => <div className="supplier-line" key={index}>
            <label>Tên hàng {index + 1}<input autoFocus={index === 0} required maxLength={200} value={item.name} placeholder="Nhập tên hàng" onChange={(e) => setEntryForm({ ...entryForm, items: entryForm.items.map((line, i) => i === index ? { ...line, name: e.target.value } : line) })}/></label>
            <label>Số lượng<input type="number" required min="0.001" max="99999999999.999" step="0.001" value={item.quantity} onChange={(e) => setEntryForm({ ...entryForm, items: entryForm.items.map((line, i) => i === index ? { ...line, quantity: e.target.value } : line) })}/></label>
            <label>Đơn giá<input type="number" required min="0" max="999999999999.99" step="0.01" value={item.unit_price} onChange={(e) => setEntryForm({ ...entryForm, items: entryForm.items.map((line, i) => i === index ? { ...line, unit_price: e.target.value } : line) })}/></label>
            <div className="supplier-line-total"><small>Thành tiền</small><strong>{amountText(supplierLineTotal(item.quantity, item.unit_price))}</strong></div>
            <button className="icon-button danger" type="button" aria-label={`Xóa dòng ${index + 1}`} disabled={entryForm.items.length === 1} onClick={() => setEntryForm({ ...entryForm, items: entryForm.items.filter((_, i) => i !== index) })}><Trash2 size={17}/></button>
          </div>)}
          <button className="secondary-button" type="button" disabled={entryForm.items.length >= 200} onClick={() => setEntryForm({ ...entryForm, items: [...entryForm.items, { name: "", quantity: "1", unit_price: "" }] })}><Plus size={16}/>Thêm dòng hàng</button>
        </section> : null}
        <label className="span-2">Nội dung<input required maxLength={500} value={entryForm.description} placeholder="Ví dụ: Nhập hàng hoặc phí ship ngày 19/10" onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}/></label>
        <label className="span-2">Ghi chú<textarea maxLength={2000} value={entryForm.note || ""} placeholder="Ghi chú hàng trả, chất lượng, thỏa thuận..." onChange={(e) => setEntryForm({ ...entryForm, note: e.target.value })}/></label>
        <div className="supplier-form-total span-2"><span>{entryForm.kind === "decrease" ? "Giảm công nợ" : "Tổng tiền phiếu"}</span><strong>{amountText(entryTotal)}</strong></div>
        <div className="span-2">{modalAlert}</div><div className="form-actions span-2"><button className="secondary-button" type="button" disabled={busy} onClick={() => onClose ? onClose() : setEntryForm(emptyEntry(entryForm.supplier_id, entryForm.kind))}>{onClose ? "Đóng" : "Nhập lại"}</button><button className="primary-button" type="submit" disabled={busy || !entryForm.supplier_id || Number(entryTotal) <= 0 || Number(entryTotal) > 999999999999.99}>{busy ? "Đang lưu..." : "Lưu phiếu"}</button></div>
      </form>
  );
}
