import { Edit2, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { ProductModal } from "../components/ProductModal";
import { PaginationBar } from "../components/PaginationBar";
import { StatusBadge } from "../components/StatusBadge";
import type { Product } from "../types";
import { money, numberText } from "../utils/format";

export function ProductsPage() {
  const { hasPermission } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  async function loadProducts(keyword = search) {
    setLoading(true);
    setError("");
    try {
      setProducts(await api.products.listAll(keyword));
      setCurrentPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được sản phẩm");
    } finally {
      setLoading(false);
    }
  }

  const visibleProducts = products.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    void loadProducts("");
  }, []);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setModalOpen(true);
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
        {hasPermission("products.create") ? <button className="primary-button" type="button" onClick={openCreate}>
          <Plus size={17} />
          Thêm sản phẩm
        </button> : null}
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã SP</th>
              <th>Tên sản phẩm</th>
              <th>Ngành hàng</th>
              <th>Đơn vị</th>
              <th>Giá bán</th>
              <th>Giá vốn</th>
              <th>Tồn kho</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => (
              <tr key={product.id}>
                <td className="code-cell">{product.code}</td>
                <td>{product.name}</td>
                <td>{product.category?.name ?? "Chưa phân loại"}</td>
                <td>{product.unit}</td>
                <td className="numeric">{money(product.sale_price)}</td>
                <td className="numeric">{money(product.cost_price)}</td>
                <td className="numeric">{numberText(product.stock_quantity, 3)}</td>
                <td>
                  <StatusBadge status={product.status} />
                </td>
                <td className="row-actions">
                  {hasPermission("products.update") ? <button className="icon-button" type="button" onClick={() => openEdit(product)} aria-label="Sửa">
                    <Edit2 size={16} />
                  </button> : null}
                  {hasPermission("products.delete") ? <button className="icon-button danger" type="button" onClick={() => void remove(product)} aria-label="Xóa">
                    <Trash2 size={16} />
                  </button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && products.length === 0 ? (
          <EmptyState title="Chưa có sản phẩm" description="Thêm sản phẩm để bắt đầu tạo hóa đơn." />
        ) : null}
      </section>

      <PaginationBar total={products.length} page={currentPage} pageSize={pageSize} itemLabel="sản phẩm" onPageChange={setCurrentPage} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setCurrentPage(1); }} />

      {modalOpen ? (
        <ProductModal
          product={editing}
          onClose={() => { setEditing(null); setModalOpen(false); }}
          onSaved={() => {
            setEditing(null);
            setModalOpen(false);
            void loadProducts();
          }}
        />
      ) : null}
    </div>
  );
}
