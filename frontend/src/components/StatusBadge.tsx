import type { InvoiceStatus, ProductStatus } from "../types";

const labels: Record<InvoiceStatus | ProductStatus, string> = {
  active: "Đang bán",
  inactive: "Ngừng bán",
  created: "Đã tạo",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

export function StatusBadge({ status }: { status: InvoiceStatus | ProductStatus }) {
  return <span className={`status-badge ${status}`}>{labels[status]}</span>;
}

