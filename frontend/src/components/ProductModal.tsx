import { Plus, Save } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Product, ProductCategory, ProductPayload, ProductStatus } from "../types";
import { Modal } from "./Modal";

export function productCodeFromName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").trim().replace(/\s+/g, "_").toUpperCase();
}

export function ProductModal({ initialName = "", prefillFromName = false, product, onClose, onSaved }: {
  initialName?: string;
  prefillFromName?: boolean;
  product?: Product | null;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const { hasPermission } = useAuth();
  const normalizedInitialName = initialName.trim().replace(/\s+/g, " ");
  const initialForm: ProductPayload = product ? {
    code: product.code, name: product.name, unit: product.unit, category_id: product.category_id ?? null,
    sale_price: product.sale_price, cost_price: product.cost_price, stock_quantity: product.stock_quantity,
    status: product.status, is_quick_select: product.is_quick_select, quick_select_order: product.quick_select_order,
  } : {
    code: prefillFromName ? productCodeFromName(normalizedInitialName) : "", name: normalizedInitialName, unit: "cái", category_id: null,
    sale_price: "0", cost_price: "0", stock_quantity: "0",
    status: "active", is_quick_select: false, quick_select_order: 0,
  };
  const [form, setForm] = useState<ProductPayload>(initialForm);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryNote, setNewCategoryNote] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const categorySavingRef = useRef(false);
  const [categoryCreateError, setCategoryCreateError] = useState("");
  const busy = saving || categorySaving;

  useEffect(() => {
    let active = true;
    void api.productCategories.list()
      .then((data) => { if (active) setCategories(data); })
      .catch(() => { if (active) setCategoryError("Không tải được ngành hàng. Bạn vẫn có thể tạo sản phẩm chưa phân loại."); })
      .finally(() => { if (active) setCategoriesLoading(false); });
    return () => { active = false; };
  }, []);

  function close() {
    if (!savingRef.current && !categorySavingRef.current) onClose();
  }

  async function createCategory() {
    if (savingRef.current || categorySavingRef.current || !hasPermission("product_categories.create")) return;
    const name = newCategoryName.trim();
    setCategoryCreateError("");
    if (!name) {
      setCategoryCreateError("Vui lòng nhập tên ngành hàng.");
      return;
    }
    categorySavingRef.current = true;
    setCategorySaving(true);
    try {
      const category = await api.productCategories.create({ name, note: newCategoryNote.trim() || undefined });
      setCategories((current) => [...current, category]);
      setForm((current) => ({ ...current, category_id: category.id }));
      setNewCategoryName("");
      setNewCategoryNote("");
      setCategoryError("");
    } catch (err) {
      setCategoryCreateError(err instanceof Error ? err.message : "Không tạo được ngành hàng.");
    } finally {
      categorySavingRef.current = false;
      setCategorySaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || categorySavingRef.current) return;
    setError("");
    if (!hasPermission(product ? "products.update" : "products.create")) {
      setError("Bạn không có quyền lưu sản phẩm.");
      return;
    }
    const payload = { ...form, code: form.code.trim(), name: form.name.trim(), unit: form.unit.trim() };
    if (!payload.code || !payload.name || !payload.unit) {
      setError("Vui lòng nhập mã, tên sản phẩm và đơn vị tính.");
      return;
    }
    if (payload.code.length > 40) {
      setError("Mã sản phẩm tối đa 40 ký tự. Vui lòng rút gọn mã trước khi lưu.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = product ? await api.products.update(product.id, payload) : await api.products.create(payload);
      onSaved(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không lưu được sản phẩm";
      setError(message === "Product code already exists" ? "Mã sản phẩm đã tồn tại. Vui lòng chọn mã khác." : message === "Product category not found" ? "Ngành hàng không còn tồn tại. Vui lòng chọn lại." : message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal title={product ? "Cập nhật sản phẩm" : "Thêm sản phẩm"} onClose={close} className="product-modal">
      <form className="form-grid product-modal-form" onSubmit={(event) => void submit(event)}>
        {error ? <div className="alert error span-2" role="alert">{error}</div> : null}
        <label>Mã sản phẩm<input required maxLength={40} disabled={busy} placeholder="Nhập mã sản phẩm" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
        <label>Tên sản phẩm<input autoFocus={!prefillFromName} required maxLength={240} disabled={busy} placeholder="Nhập tên sản phẩm" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Ngành hàng
          <select disabled={busy || categoriesLoading} value={form.category_id ?? ""} onChange={(event) => setForm({ ...form, category_id: event.target.value ? Number(event.target.value) : null })}>
            <option value="">{categoriesLoading ? "Đang tải ngành hàng..." : "Chưa phân loại"}</option>
            {product?.category && !categories.some((category) => category.id === product.category_id) ? <option value={product.category.id}>{product.category.name}</option> : null}
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label>Đơn vị tính<input required maxLength={40} disabled={busy} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
        <div className="product-modal-section-title span-2">Giá bán & tồn kho</div>
        <label>Giá bán (₫)<input autoFocus={prefillFromName} onFocus={(event) => event.currentTarget.select()} type="number" min="0" step="0.01" required disabled={busy} value={form.sale_price} onChange={(event) => setForm({ ...form, sale_price: event.target.value })} /></label>
        <label>Giá vốn (₫)<input type="number" min="0" step="0.01" required disabled={busy} value={form.cost_price} onChange={(event) => setForm({ ...form, cost_price: event.target.value })} /></label>
        <label>Tồn kho<input type="number" step="0.001" required disabled={busy} value={form.stock_quantity} onChange={(event) => setForm({ ...form, stock_quantity: event.target.value })} /></label>
        <label>Trạng thái<select disabled={busy} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ProductStatus })}><option value="active">Đang bán</option><option value="inactive">Ngừng bán</option></select></label>
        {categoryError ? <div className="alert span-2" role="status">{categoryError}</div> : null}
        {hasPermission("product_categories.create") ? (
          <section className="product-modal-category span-2" aria-label="Tạo nhanh ngành hàng">
            <strong className="product-modal-category-heading">Tạo nhanh ngành hàng</strong>
            <input aria-label="Tên ngành hàng mới" maxLength={160} disabled={busy} value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Tên ngành hàng" />
            <input aria-label="Ghi chú ngành hàng mới" disabled={busy} value={newCategoryNote} onChange={(event) => setNewCategoryNote(event.target.value)} placeholder="Ghi chú (không bắt buộc)" />
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void createCategory()}><Plus size={16} />{categorySaving ? "Đang tạo..." : "Tạo"}</button>
            {categoryCreateError ? <div className="alert error product-modal-category-error" role="alert">{categoryCreateError}</div> : null}
          </section>
        ) : null}
        <div className="form-actions span-2">
          <button className="secondary-button product-modal-reset" type="button" disabled={busy} onClick={() => { setForm(initialForm); setError(""); setNewCategoryName(""); setNewCategoryNote(""); setCategoryCreateError(""); }}>Làm mới</button>
          <button className="secondary-button" type="button" disabled={busy} onClick={close}>Hủy</button>
          <button className="primary-button" type="submit" disabled={busy}><Save size={16} />{saving ? "Đang lưu..." : "Lưu sản phẩm"}</button>
        </div>
      </form>
    </Modal>
  );
}
