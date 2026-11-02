import { CheckCircle2, Columns3, LoaderCircle, MapPin, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import { DateRangePicker } from "../components/DateRangePicker";
import { ToastNotification } from "../components/ToastNotification";
import { EmptyState } from "../components/EmptyState";
import type { ExternalHandoverBatch } from "../types";
import { money, numberText, todayInputValue } from "../utils/format";
import "./AhamoveHandedOverPage.css";

type CompletionProps = {
  transferNote: string;
  cashNote: string;
  completed: boolean;
  disabled: boolean;
  saving: boolean;
  error: string;
  onTransferChange: (value: string) => void;
  onCashChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onMissingNote: () => void;
};

export function AhamoveBatchCompletionForm(props: CompletionProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (props.disabled || props.completed || props.saving) return;
    if (!(props.transferNote.trim() || props.cashNote.trim())) {
      props.onMissingNote();
      return;
    }
    props.onSubmit(event);
  }
  return <form className="ahamove-inline-completion" onSubmit={submit}>
    <div className="ahamove-payment-note-fields">
      <input type="text" placeholder="Chuyển khoản" aria-label="Ghi chú Chuyển khoản" autoComplete="off" maxLength={1000} value={props.transferNote} onFocus={event => event.currentTarget.select()} onChange={event => props.onTransferChange(event.target.value)} readOnly={props.completed} disabled={props.disabled}/>
      <input type="text" placeholder="Tiền mặt" aria-label="Ghi chú Tiền mặt" autoComplete="off" maxLength={1000} value={props.cashNote} onFocus={event => event.currentTarget.select()} onChange={event => props.onCashChange(event.target.value)} readOnly={props.completed} disabled={props.disabled}/>
    </div>
    <button className="primary-button" type="submit" disabled={props.disabled || props.completed || props.saving}>{props.saving ? <LoaderCircle size={15} className="loading-spinner"/> : <CheckCircle2 size={15}/>}Hoàn thành</button>
    {props.error ? <p className="ahamove-completion-error" role="alert">{props.error}</p> : null}
  </form>;
}

export function AhamoveBatchColumn({ batch, disabled = false, onComplete, onMissingNote }: { batch: ExternalHandoverBatch; disabled?: boolean; onMissingNote: () => void; onComplete: (batch: ExternalHandoverBatch, transferNote: string, cashNote: string) => Promise<void> }) {
  const items = batch.items.filter(item => item.is_active && !item.invoice.deleted_at);
  const [transferNote, setTransferNote] = useState(batch.transfer_note ?? (batch.handover_status === "completed" ? "" : numberText(batch.advance_amount)));
  const [cashNote, setCashNote] = useState(batch.cash_note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const completed = batch.handover_status === "completed";

  async function complete(event: FormEvent) {
    event.preventDefault();
    if (disabled || saving || completed || !(transferNote.trim() || cashNote.trim())) return;
    setSaving(true);
    setError("");
    try { await onComplete(batch, transferNote.trim(), cashNote.trim()); }
    catch (err) { setError(err instanceof Error ? err.message : "Không hoàn thành được tập bàn giao"); }
    finally { setSaving(false); }
  }

  return <section className="ahamove-batch-column" aria-labelledby={`ahamove-batch-${batch.id}`}>
    <header className="ahamove-batch-heading">
      <div className="ahamove-batch-title"><span className="ahamove-batch-icon"><Truck size={18}/></span><h2 id={`ahamove-batch-${batch.id}`}>{batch.code} <span className="ahamove-batch-order-count">({items.length} Đơn)</span></h2><span className={`ahamove-batch-status ${batch.handover_status || "created"}`}>{completed ? "Hoàn thành" : "Tạo mới"}</span></div>
      <div className="ahamove-batch-finance"><span>Tiền ship<strong>{money(batch.shipping_fee)}</strong></span><span>Số tiền cần ứng<strong>{money(batch.advance_amount)}</strong></span></div>
      <div className="ahamove-batch-note-preview"><AhamoveBatchCompletionForm transferNote={transferNote} cashNote={cashNote} completed={completed} disabled={disabled || saving} saving={saving} error={error} onMissingNote={onMissingNote} onTransferChange={setTransferNote} onCashChange={setCashNote} onSubmit={event => void complete(event)}/></div>
      {batch.note ? <p className="ahamove-legacy-note">{batch.note}</p> : null}
      {batch.is_reconciled ? <span className="ahamove-batch-reconciled"><CheckCircle2 size={13}/>Đã kiểm kê</span> : null}
    </header>
    <div className="ahamove-batch-addresses" role="region" aria-label={`Địa chỉ giao hàng tập ${batch.code}`} tabIndex={0}>
      {items.length > 0 ? <ul>{items.map(({ id, invoice }) => <li key={id}><MapPin size={18} strokeWidth={2.5} aria-hidden="true"/><span>{invoice.customer?.address?.trim() || "Chưa có địa chỉ"}</span></li>)}</ul> : <EmptyState title="Không còn đơn trong tập" description="Các đơn đã được gỡ hoặc xóa khỏi danh sách."/>}
    </div>
  </section>;
}

export function AhamoveHandedOverPage() {
  const today = todayInputValue();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [batches, setBatches] = useState<ExternalHandoverBatch[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "created">("created");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingBatchId, setSavingBatchId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ title: string; message: string; variant: "success" | "warning" } | null>(null);
  const requestVersion = useRef(0);

  async function load() {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const data = await api.ahamove.externalBatches(fromDate, toDate);
      if (version === requestVersion.current) setBatches(data.filter(batch => batch.status === "active"));
    } catch (err) {
      if (version === requestVersion.current) {
        setBatches([]);
        setError(err instanceof Error ? err.message : "Không tải được các tập đơn đã bàn giao");
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    if ((fromDate && toDate) || (!fromDate && !toDate)) void load();
    return () => { requestVersion.current += 1; };
  }, [fromDate, toDate]);

  async function completeBatch(batch: ExternalHandoverBatch, transferNote: string, cashNote: string) {
    setSavingBatchId(batch.id);
    try {
      const updated = await api.ahamove.completeBatch(batch.id, transferNote, cashNote, batch.note ?? null);
      setBatches(current => current.map(item => item.id === updated.id ? updated : item));
      setToast({ title: "Đã hoàn thành tập bàn giao", message: "Ghi chú chuyển khoản và tiền mặt đã được lưu.", variant: "success" });
    } finally { setSavingBatchId(null); }
  }

  const visibleBatches = batches.filter(batch => statusFilter === "all" || (batch.handover_status || "created") === statusFilter);
  const orderCount = visibleBatches.reduce((sum, batch) => sum + batch.items.filter(item => item.is_active && !item.invoice.deleted_at).length, 0);
  return <div className="page-stack ahamove-handed-over-page">
    <section className="toolbar ahamove-board-toolbar">
      <div className="ahamove-status-filters" role="group" aria-label="Lọc trạng thái tập bàn giao">
        {([{ value: "all", label: "Tất cả" }, { value: "completed", label: "Hoàn thành" }, { value: "created", label: "Tạo mới" }] as const).map(filter => <button key={filter.value} type="button" aria-pressed={statusFilter === filter.value} className={statusFilter === filter.value ? "active" : ""} disabled={savingBatchId !== null} onClick={() => setStatusFilter(filter.value)}>{filter.label}<span>{batches.filter(batch => filter.value === "all" || (batch.handover_status || "created") === filter.value).length}</span></button>)}
      </div>
      <div className="ahamove-board-controls"><DateRangePicker disabled={savingBatchId !== null} from={fromDate} to={toDate} onChange={(from, to) => { setFromDate(from); setToDate(to); }}/><button className="secondary-button" disabled={savingBatchId !== null || loading || Boolean(fromDate) !== Boolean(toDate)} onClick={() => void load()}><RefreshCw size={16} className={loading ? "loading-spinner" : undefined}/>Làm mới</button></div>
    </section>
    {error ? <div role="alert" className="alert error">{error}</div> : null}
    <div className="ahamove-board-summary" aria-live="polite"><span><Columns3 size={15}/><strong>{visibleBatches.length}</strong> tập bàn giao</span><span><PackageCheck size={15}/><strong>{orderCount}</strong> đơn</span><small>Kéo ngang để xem các tập · Cuộn trong mỗi cột để xem đơn</small></div>
    {loading ? <EmptyState title="Đang tải các tập đơn đã bàn giao..."/> : visibleBatches.length === 0 ? <EmptyState title={statusFilter === "created" ? "Không có tập bàn giao Tạo mới" : statusFilter === "completed" ? "Chưa có tập bàn giao Hoàn thành" : "Chưa có tập đơn đã bàn giao"} description={error ? "Hãy thử làm mới danh sách." : "Không có tập bàn giao phù hợp với trạng thái và khoảng ngày đã chọn."}/> : <div className="ahamove-batch-board" role="region" aria-label="Các tập đơn đã bàn giao" tabIndex={0}>{visibleBatches.map(batch => <AhamoveBatchColumn key={`${batch.id}:${batch.completed_at || "created"}`} batch={batch} disabled={savingBatchId !== null} onComplete={completeBatch} onMissingNote={() => setToast({ title: "Chưa có ghi chú", message: "Vui lòng nhập ghi chú Chuyển khoản hoặc Tiền mặt", variant: "warning" })}/>)}</div>}
    {toast ? <ToastNotification {...toast} onClose={() => setToast(null)}/> : null}
  </div>;
}
