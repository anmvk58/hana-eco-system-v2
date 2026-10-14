import { useState } from "react";
import { CreditCard } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./Modal";
import { TransferPaymentButton } from "./TransferPaymentButton";
import type { Invoice } from "../types";
import { money, normalizeInvoiceCodeSearch } from "../utils/format";

export function TransferPaymentLookup() {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!hasPermission("invoices.view") || !hasPermission("invoices.update")) return null;
  async function search() {
    if (!code.trim()) { setError("Vui lòng nhập mã đơn"); return; }
    setLoading(true); setError(""); setInvoices([]);
    try {
      const result = await api.invoices.list({ code: normalizeInvoiceCodeSearch(code), exclude_cancelled: true, page_size: 20 });
      setInvoices(result.items);
      if (!result.items.length) setError("Không tìm thấy đơn phù hợp");
    } catch (err) { setError(err instanceof Error ? err.message : "Không tìm được đơn"); }
    finally { setLoading(false); }
  }
  return <>
    <button className="secondary-button compact-button" type="button" onClick={() => { setCode(""); setInvoices([]); setError(""); setOpen(true); }}><CreditCard size={16}/>Chuyển khoản đơn đã lưu</button>
    {open ? <Modal title="Chuyển khoản đơn đã lưu" onClose={() => !loading && setOpen(false)}><div className="transfer-payment-confirmation">
      <label>Mã đơn<input value={code} onChange={(event) => { setCode(event.target.value); setInvoices([]); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="Ví dụ: HD-261009-001"/></label>
      <button className="secondary-button" type="button" disabled={loading} onClick={() => void search()}>{loading ? "Đang tìm…" : "Tìm đơn"}</button>
      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {invoices.map((invoice) => <div className="transfer-payment-result" key={invoice.id}><span><strong>{invoice.code}</strong><br/>{invoice.customer?.name || "Khách lẻ"} · {money(invoice.total_amount)}</span><TransferPaymentButton invoice={invoice} disabled={loading} onChanged={search}/></div>)}
    </div></Modal> : null}
  </>;
}
