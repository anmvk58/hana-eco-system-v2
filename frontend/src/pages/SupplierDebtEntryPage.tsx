import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { SupplierDebtEntryEditor } from "../components/SupplierDebtEntryEditor";
import { EmptyState } from "../components/EmptyState";
import { ToastNotification } from "../components/ToastNotification";
import type { Supplier } from "../types";

export function SupplierDebtEntryPage() {
  const [params] = useSearchParams();
  const requestedSupplierId = Number(params.get("supplier")) || 0;
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    void api.supplierDebts.suppliers().then((data) => { if (!cancelled) setSuppliers(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Không tải được nhà cung cấp."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refresh]);
  const active = suppliers.filter((s) => s.is_active);
  return <div className="page-stack supplier-entry-page">
    <section className="toolbar supplier-toolbar"><div><h2 className="toolbar-title"><Plus size={20}/>Nhập phiếu công nợ</h2><span className="field-hint">Chọn nhà cung cấp và lập phiếu nhập hàng, tăng hoặc giảm công nợ.</span></div>
      <div className="supplier-actions"><Link className="secondary-button" to="/supplier-debts/entries">Danh sách phiếu</Link><Link className="secondary-button" to="/supplier-debts">Nhà cung cấp</Link><button className="secondary-button" aria-label="Tải lại nhà cung cấp" disabled={loading} onClick={() => setRefresh((n) => n + 1)}><RefreshCw size={16}/></button></div>
    </section>
    {error ? <div className="alert error" role="alert">{error}</div> : null}
    {loading ? <p className="supplier-loading">Đang tải nhà cung cấp...</p> : !error && active.length === 0 ? <EmptyState title="Chưa có nhà cung cấp đang sử dụng" description="Thêm mới hoặc kích hoạt nhà cung cấp ở màn hình Nhà cung cấp."/> : !error ? <section className="table-panel supplier-entry-panel">
      <SupplierDebtEntryEditor suppliers={suppliers} defaultSupplierId={active.some((s) => s.id === requestedSupplierId) ? requestedSupplierId : 0} onSaved={(entry) => setToast(`Đã lưu ${entry.code}. Bạn có thể tiếp tục nhập phiếu mới.`)}/>
    </section> : null}
    {toast ? <ToastNotification title="Đã lưu phiếu công nợ" message={toast} onClose={() => setToast("")}/> : null}
  </div>;
}
