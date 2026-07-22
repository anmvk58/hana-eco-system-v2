import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";

export function ForbiddenPage() {
  return <div className="table-panel empty-state"><ShieldX size={42} /><strong>Không có quyền truy cập</strong><span>Role của bạn chưa được cấp quyền cho chức năng này.</span><Link className="secondary-button link-button" to="/">Về trang chính</Link></div>;
}
