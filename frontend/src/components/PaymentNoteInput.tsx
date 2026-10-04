import { useEffect, useId, useState } from "react";
import { Plus, Settings2, X } from "lucide-react";

import { api } from "../api/client";

interface Props {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PaymentNoteInput({ label, placeholder, value, onChange, disabled = false }: Props) {
  const id = useId();
  const [notes, setNotes] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.paymentNoteSettings.get().then((settings) => {
      if (active) { setNotes(settings.notes); setLoaded(true); }
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "Không tải được ghi chú điền nhanh");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  async function saveSettings() {
    if (!draft) return;
    const normalized = draft.map((note) => note.trim());
    if (normalized.some((note) => !note || note.length > 100) || new Set(normalized.map((note) => note.toLocaleLowerCase())).size !== normalized.length) {
      setError("Mỗi nội dung phải có từ 1 đến 100 ký tự và không được trùng nhau.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const settings = await api.paymentNoteSettings.update(normalized);
      setNotes(settings.notes);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được cấu hình ghi chú");
    } finally {
      setSaving(false);
    }
  }

  return <div className="payment-note-input">
    <label htmlFor={id}>{label}<textarea id={id} maxLength={500} value={value} disabled={disabled || saving} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/></label>
    <div className="payment-note-shortcuts" aria-label="Ghi chú điền nhanh">
      {notes.map((note) => <button key={note} type="button" className={`payment-note-chip${value === note ? " selected" : ""}`} aria-pressed={value === note} disabled={disabled || saving} onClick={() => onChange(note)}>{note}</button>)}
      <button type="button" className="payment-note-configure" disabled={disabled || loading || saving || !loaded} onClick={() => { setDraft(draft ? null : [...notes]); setError(""); }}><Settings2 size={14}/>{draft ? "Đóng cấu hình" : "Cấu hình"}</button>
    </div>
    {draft ? <div className="payment-note-settings">
      <p>Ghi chú điền nhanh dùng chung cho các màn hình thu tiền và kiểm kê.</p>
      <div className="payment-note-settings-fields">{draft.map((note, index) => <div className="payment-note-settings-item" key={index}><label>Nội dung {index + 1}<input onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!disabled && !saving) void saveSettings(); } }} maxLength={100} value={note} disabled={disabled || saving} onChange={(event) => setDraft(draft.map((current, position) => position === index ? event.target.value : current))}/></label><button type="button" className="payment-note-remove" disabled={disabled || saving} aria-label={`Xóa nội dung ${index + 1}`} title="Xóa nội dung" onClick={() => setDraft(draft.filter((_, position) => position !== index))}><X size={16}/></button></div>)}</div>
      {draft.length === 0 ? <p>Chưa có nội dung điền nhanh. Bấm “Thêm nội dung” để bổ sung.</p> : null}
      <button type="button" className="secondary-button compact-button payment-note-add" disabled={disabled || saving} onClick={() => setDraft([...draft, ""])}><Plus size={14}/>Thêm nội dung</button>
      <div className="payment-note-settings-actions"><button type="button" className="secondary-button compact-button" disabled={disabled || saving} onClick={() => { setDraft(null); setError(""); }}>Hủy</button><button type="button" className="primary-button compact-button" disabled={disabled || saving} onClick={() => void saveSettings()}>{saving ? "Đang lưu…" : "Lưu cấu hình"}</button></div>
    </div> : null}
    {error ? <p className="payment-note-error" role="alert">{error}{!loaded ? <button type="button" className="payment-note-configure" disabled={disabled || loading} onClick={() => setReload((current) => current + 1)}>Thử lại</button> : null}</p> : null}
  </div>;
}
