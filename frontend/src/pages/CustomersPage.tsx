import { Edit2, Plus, Search, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import type { Customer, CustomerPayload } from "../types";
import { dateTime } from "../utils/format";

const blankCustomer: CustomerPayload = {
  code: "",
  name: "",
  phone: "",
  address: "",
  note: "",
};

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerPayload>(blankCustomer);

  async function loadCustomers(keyword = search) {
    setLoading(true);
    setError("");
    try {
      setCustomers(await api.customers.list(keyword));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được khách hàng");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCustomers("");
  }, []);

  const modalTitle = editing ? "Cập nhật khách hàng" : "Thêm khách hàng";

  function openCreate() {
    setEditing(null);
    setForm(blankCustomer);
    setModalOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setForm({
      code: customer.code,
      name: customer.name,
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      note: customer.note ?? "",
    });
    setModalOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (editing) {
        await api.customers.update(editing.id, form);
      } else {
        await api.customers.create(form);
      }
      setEditing(null);
      setForm(blankCustomer);
      setModalOpen(false);
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được khách hàng");
    }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`Xóa mềm khách hàng ${customer.name}?`)) return;
    await api.customers.remove(customer.id);
    await loadCustomers();
  }

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void loadCustomers();
            }}
            placeholder="Tìm theo tên hoặc số điện thoại"
          />
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadCustomers()}>
          Tìm kiếm
        </button>
        <button className="primary-button" type="button" onClick={openCreate}>
          <Plus size={17} />
          Thêm khách hàng
        </button>
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã KH</th>
              <th>Tên khách hàng</th>
              <th>Số điện thoại</th>
              <th>Địa chỉ</th>
              <th>Ghi chú</th>
              <th>Cập nhật</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td className="code-cell">{customer.code}</td>
                <td>{customer.name}</td>
                <td>{customer.phone}</td>
                <td>{customer.address}</td>
                <td>{customer.note}</td>
                <td>{dateTime(customer.updated_at)}</td>
                <td className="row-actions">
                  <button className="icon-button" type="button" onClick={() => openEdit(customer)} aria-label="Sửa">
                    <Edit2 size={16} />
                  </button>
                  <button className="icon-button danger" type="button" onClick={() => void remove(customer)} aria-label="Xóa">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && customers.length === 0 ? (
          <EmptyState title="Chưa có khách hàng" description="Tạo khách hàng đầu tiên để lập hóa đơn nhanh hơn." />
        ) : null}
      </section>

      {modalOpen ? (
        <Modal
          title={modalTitle}
          onClose={() => {
            setEditing(null);
            setForm(blankCustomer);
            setModalOpen(false);
          }}
        >
          <form className="form-grid" onSubmit={(event) => void submit(event)}>
            <label>
              Mã khách hàng
              <input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </label>
            <label>
              Tên khách hàng
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Số điện thoại
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label>
              Địa chỉ
              <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </label>
            <label className="span-2">
              Ghi chú
              <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </label>
            <div className="form-actions span-2">
              <button className="secondary-button" type="button" onClick={() => setForm(blankCustomer)}>
                Làm mới
              </button>
              <button className="primary-button" type="submit">
                Lưu khách hàng
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
