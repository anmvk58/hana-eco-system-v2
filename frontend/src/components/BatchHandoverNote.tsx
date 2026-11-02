import "./BatchHandoverNote.css";

export function BatchHandoverNote({ note }: { note?: string | null }) {
  if (!note) return null;
  return <div className="batch-handover-note"><strong>Ghi chú bàn giao</strong><p>{note}</p></div>;
}
