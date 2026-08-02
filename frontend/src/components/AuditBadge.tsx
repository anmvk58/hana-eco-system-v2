import type { InvoiceAuditLabel } from "../types";

const labels: Record<InvoiceAuditLabel, string> = {
  retail: "Khách lẻ",
  internal_shipper: "Ship Ruột",
  external_shipper: "Ship Ngoài",
};

export function AuditBadge({ label }: { label?: InvoiceAuditLabel | null }) {
  if (!label) return <span className="audit-badge unaudited">Chưa audit</span>;
  return <span className={`audit-badge ${label}`}>{labels[label]}</span>;
}
