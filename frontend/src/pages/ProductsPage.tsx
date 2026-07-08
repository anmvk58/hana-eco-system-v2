import { Edit2, Plus, Search, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import type { Product, ProductPayload, ProductStatus } from "../types";
import { money, numberText } from "../utils/format";

const blankProduct: ProductPayload = {
  code: "",
  name: "",
  unit: "cái",
  sale_price: "0",
  cost_price: "0",
  stock_quantity: "0",
  status: "active",
};

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductPayload>(blankProduct);

  async function loadProducts(keyword = search) {
    setLoading(true);
    setError("");
    try {
      setProducts(await api.products.list(keyword));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được sản phẩm");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts("");
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(blankProduct);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({
      code: product.code,
      name: product.name,
      unit: product.unit,
      sale_price: product.sale_price,
      cost_price: product.cost_price,
      stock_quantity: product.stock_quantity,
      status: product.status,
    });
    setModalOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (editing) {
        await api.products.update(editing.id, form);
      } else {
        await api.products.create(form);
      }
      setEditing(null);
      setForm(blankProduct);
      setModalOpen(false);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được sản phẩm");
    }
  }

  async function remove(product: Product) {
    if (!window.confirm(`Xóa mềm sản phẩm ${product.name}?`)) return;
    await api.products.remove(product.id);
    await loadProducts();
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
              if (event.key === "Enter") void loadProducts();
            }}
            placeholder="Tìm theo mã hoặc tên sản phẩm"
          />
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadProducts()}>
          Tìm kiếm
        </button>
        <button className="primary-button" type="button" onClick={openCreate}>
          <Plus size={17} />
          Thêm sản phẩm
        </button>
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã SP</th>
              <th>Tên sản phẩm</th>
              <th>Đơn vị</th>
              <th>Giá bán</th>
              <th>Giá vốn</th>
              <th>Tồn kho</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td className="code-cell">{product.code}</td>
                <td>{product.name}</td>
                <td>{product.unit}</td>
                <td className="numeric">{money(product.sale_price)}</td>
                <td className="numeric">{money(product.cost_price)}</td>
                <td className="numeric">{numberText(product.stock_quantity, 3)}</td>
                <td>
                  <StatusBadge status={product.status} />
                </td>
                <td className="row-actions">
                  <button className="icon-button" type="button" onClick={() => openEdit(product)} aria-label="Sửa">
                    <Edit2 size={16} />
                  </button>
                  <button className="icon-button danger" type="button" onClick={() => void remove(product)} aria-label="Xóa">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && products.length === 0 ? (
          <EmptyState title="Chưa có sản phẩm" description="Thêm sản phẩm để bắt đầu tạo hóa đơn." />
        ) : null}
      </section>

      {modalOpen ? (
        <Modal
          title={editing ? "Cập nhật sản phẩm" : "Thêm sản phẩm"}
          onClose={() => {
            setEditing(null);
            setForm(blankProduct);
            setModalOpen(false);
          }}
        >
          <form className="form-grid" onSubmit={(event) => void submit(event)}>
            <label>
              Mã sản phẩm
              <input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </label>
            <label>
              Tên sản phẩm
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Đơn vị tính
              <input required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            </label>
            <label>
              Trạng thái
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ProductStatus })}>
                <option value="active">Đang bán</option>
                <option value="inactive">Ngừng bán</option>
              </select>
            </label>
            <label>
              Giá bán
              <input type="number" min="0" required value={form.sale_price} onChange={(event) => setForm({ ...form, sale_price: event.target.value })} />
            </label>
            <label>
              Giá vốn
              <input type="number" min="0" required value={form.cost_price} onChange={(event) => setForm({ ...form, cost_price: event.target.value })} />
            </label>
            <label>
              Tồn kho
              <input type="number" required value={form.stock_quantity} onChange={(event) => setForm({ ...form, stock_quantity: event.target.value })} />
            </label>
            <div className="form-actions span-2">
              <button className="secondary-button" type="button" onClick={() => setForm(blankProduct)}>
                Làm mới
              </button>
              <button className="primary-button" type="submit">
                Lưu sản phẩm
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
