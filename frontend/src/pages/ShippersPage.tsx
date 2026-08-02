import { Edit2, Plus, Trash2, Truck } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import type { Shipper, ShipperPayload } from "../types";

const emptyForm: ShipperPayload = { username: "", display_name: "", password: "", phone: "", note: "", is_active: true };

export function ShippersPage() {
  const { hasPermission } = useAuth();
  const [shippers, setShippers] = useState<Shipper[]>([]);
  const [editing, setEditing] = useState<Shipper | null>(null);
  const [form, setForm] = useState<ShipperPayload>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setShippers(await api.shippers.list());
  }

  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách shipper")); }, []);

  function openModal(shipper?: Shipper) {
    setEditing(shipper ?? null);
    setForm(shipper ? {
      display_name: shipper.user.display_name,
      password: "",
      phone: shipper.phone ?? "",
      note: shipper.note ?? "",
      is_active: shipper.is_active,
    } : emptyForm);
    setModalOpen(true);
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = { ...form };
      if (editing && !payload.password) delete payload.password;
      if (editing) await api.shippers.update(editing.id, payload);
      else await api.shippers.create(payload);
      setModalOpen(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Không lưu được shipper"); }
  }

  async function deactivate(shipper: Shipper) {
    if (!window.confirm(`Khóa tài khoản shipper ${shipper.user.display_name}?`)) return;
    try { await api.shippers.remove(shipper.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không khóa được shipper"); }
  }

  return <div className="page-stack">
    <section className="toolbar">
      <div>
        <h2 className="toolbar-title"><Truck size={20}/>Shipper nội bộ</h2>
        <span className="field-hint">Mỗi shipper có tài khoản riêng để đăng nhập và nhận đơn trong ngày.</span>
      </div>
      <span className="toolbar-spacer" />
      {hasPermission("shippers.create") ? <button className="primary-button" onClick={() => openModal()}><Plus size={17}/>Thêm shipper</button> : null}
    </section>
    {error ? <div className="alert error">{error}</div> : null}
    <section className="table-panel">
      <table className="data-table"><thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Số điện thoại</th><th>Ghi chú</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{shippers.map((shipper) => <tr key={shipper.id}>
          <td className="code-cell">{shipper.user.username}</td><td>{shipper.user.display_name}</td><td>{shipper.phone || "-"}</td><td>{shipper.note || "-"}</td>
          <td><span className={`status-badge ${shipper.is_active ? "active" : "inactive"}`}>{shipper.is_active ? "Hoạt động" : "Đã khóa"}</span></td>
          <td className="row-actions">{hasPermission("shippers.update") ? <button className="icon-button" onClick={() => openModal(shipper)} aria-label="Sửa shipper"><Edit2 size={16}/></button> : null}{hasPermission("shippers.delete") && shipper.is_active ? <button className="icon-button danger" onClick={() => void deactivate(shipper)} aria-label="Khóa shipper"><Trash2 size={16}/></button> : null}</td>
        </tr>)}</tbody></table>
      {shippers.length === 0 ? <EmptyState title="Chưa có shipper nội bộ" description="Tạo tài khoản shipper đầu tiên để bắt đầu bàn giao đơn."/> : null}
    </section>
    {modalOpen ? <Modal title={editing ? "Cập nhật shipper" : "Thêm shipper nội bộ"} onClose={() => setModalOpen(false)}>
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        {!editing ? <label>Tên đăng nhập<input required pattern="[A-Za-z0-9._-]+" value={form.username ?? ""} onChange={(event) => setForm({...form, username: event.target.value})}/></label> : null}
        <label className={editing ? "span-2" : ""}>Họ tên<input required value={form.display_name ?? ""} onChange={(event) => setForm({...form, display_name: event.target.value})}/></label>
        <label>Số điện thoại<input value={form.phone ?? ""} onChange={(event) => setForm({...form, phone: event.target.value})}/></label>
        <label>Mật khẩu<input required={!editing} minLength={4} type="password" value={form.password ?? ""} placeholder={editing ? "Để trống nếu không đổi" : "Tối thiểu 4 ký tự"} onChange={(event) => setForm({...form, password: event.target.value})}/></label>
        <label className="span-2">Ghi chú<textarea value={form.note ?? ""} onChange={(event) => setForm({...form, note: event.target.value})}/></label>
        <label className="permission-option span-2"><input type="checkbox" checked={form.is_active ?? true} onChange={(event) => setForm({...form, is_active: event.target.checked})}/><span>Shipper đang hoạt động</span></label>
        <div className="form-actions span-2"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Hủy</button><button className="primary-button">Lưu shipper</button></div>
      </form>
    </Modal> : null}
  </div>;
}
