import { Minus, Plus, Save, Search } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import type { Customer, ExtraChargeType, Invoice, InvoiceStatus, Product } from "../types";
import { money, todayInputValue } from "../utils/format";

interface DraftLine {
  product_id: string;
  quantity: string;
  unit_price: string;
}

interface DraftCharge {
  charge_type: ExtraChargeType;
  name: string;
  amount: string;
}

const blankLine: DraftLine = { product_id: "", quantity: "1", unit_price: "0" };
const defaultCharges: DraftCharge[] = [
  { charge_type: "shipping", name: "Phi ship", amount: "0" },
  { charge_type: "packing", name: "Phi dong hang", amount: "0" },
  { charge_type: "other", name: "Phu thu khac", amount: "0" },
];

export function InvoiceFormPage() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const editingId = invoiceId ? Number(invoiceId) : null;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [soldDate, setSoldDate] = useState(todayInputValue());
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...blankLine }]);
  const [charges, setCharges] = useState<DraftCharge[]>(defaultCharges);
  const [productSearch, setProductSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBaseData() {
      const [customerData, productData] = await Promise.all([api.customers.list(), api.products.list()]);
      setCustomers(customerData);
      setProducts(productData);
    }
    void loadBaseData().catch((err) => setError(err instanceof Error ? err.message : "Không tải được dữ liệu nền"));
  }, []);

  useEffect(() => {
    if (!editingId) return;
    async function loadInvoice() {
      const data = await api.invoices.get(editingId!);
      setInvoice(data);
      setCustomerId(data.customer_id ? String(data.customer_id) : "");
      setStatus(data.status);
      setSoldDate(data.sold_at.slice(0, 10));
      setNote(data.note ?? "");
      setLines(
        data.items.map((item) => ({
          product_id: item.product_id ? String(item.product_id) : "",
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      );
      const nextCharges = defaultCharges.map((charge) => {
        const found = data.extra_charges.find((item) => item.charge_type === charge.charge_type);
        return found ? { charge_type: found.charge_type, name: found.name, amount: found.amount } : charge;
      });
      setCharges(nextCharges);
    }
    void loadInvoice().catch((err) => setError(err instanceof Error ? err.message : "Không tải được hóa đơn"));
  }, [editingId]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => `${product.code} ${product.name}`.toLowerCase().includes(keyword));
  }, [productSearch, products]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0);
    const extra = charges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
    return { subtotal, extra, total: subtotal + extra };
  }, [lines, charges]);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    const nextLines = lines.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const updated = { ...line, ...patch };
      if (patch.product_id) {
        const product = productMap.get(Number(patch.product_id));
        if (product) updated.unit_price = product.sale_price;
      }
      return updated;
    });
    setLines(nextLines);
  }

  function removeLine(index: number) {
    setLines(lines.length === 1 ? [{ ...blankLine }] : lines.filter((_, lineIndex) => lineIndex !== index));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const cleanLines = lines.filter((line) => line.product_id);
    if (cleanLines.length === 0) {
      setError("Hóa đơn cần ít nhất một sản phẩm");
      return;
    }

    const payload = {
      customer_id: customerId ? Number(customerId) : null,
      status,
      sold_at: new Date(`${soldDate}T00:00:00`).toISOString(),
      note,
      items: cleanLines.map((line) => ({
        product_id: Number(line.product_id),
        quantity: line.quantity,
        unit_price: line.unit_price,
      })),
      extra_charges: charges
        .filter((charge) => Number(charge.amount || 0) > 0)
        .map((charge) => ({
          charge_type: charge.charge_type,
          name: charge.name,
          amount: charge.amount,
        })),
      reason: reason || (editingId ? "Cap nhat hoa don" : "Tao hoa don"),
    };

    try {
      const saved = editingId ? await api.invoices.update(editingId, payload) : await api.invoices.create(payload);
      navigate(`/invoices/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được hóa đơn");
    }
  }

  return (
    <form className="invoice-workspace" onSubmit={(event) => void submit(event)}>
      <section className="sell-panel">
        <div className="panel-header">
          <div>
            <h2>{editingId ? `Sửa hóa đơn ${invoice?.code ?? ""}` : "Tạo hóa đơn mới"}</h2>
            <span>Chọn sản phẩm, số lượng, phí phát sinh và trạng thái đơn</span>
          </div>
          <button className="primary-button" type="submit">
            <Save size={17} />
            Lưu hóa đơn
          </button>
        </div>

        {error ? <div className="alert error">{error}</div> : null}

        <div className="invoice-meta">
          <label>
            Khách hàng
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Khách lẻ</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code} - {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ngày bán
            <input type="date" value={soldDate} onChange={(event) => setSoldDate(event.target.value)} />
          </label>
          <label>
            Trạng thái
            <select value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus)}>
              <option value="draft">Nháp</option>
              <option value="completed">Hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </label>
        </div>

        <div className="line-search">
          <Search size={17} />
          <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Lọc nhanh sản phẩm theo mã hoặc tên" />
        </div>

        <div className="line-table">
          <div className="line-head">
            <span>Sản phẩm</span>
            <span>Số lượng</span>
            <span>Đơn giá</span>
            <span>Thành tiền</span>
            <span></span>
          </div>
          {lines.map((line, index) => (
            <div className="line-row" key={`${index}-${line.product_id}`}>
              <select value={line.product_id} onChange={(event) => updateLine(index, { product_id: event.target.value })}>
                <option value="">Chọn sản phẩm</option>
                {filteredProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} - {product.name} ({money(product.sale_price)})
                  </option>
                ))}
              </select>
              <input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
              <input type="number" min="0" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: event.target.value })} />
              <strong>{money(Number(line.quantity || 0) * Number(line.unit_price || 0))}</strong>
              <button className="icon-button danger" type="button" onClick={() => removeLine(index)} aria-label="Xóa dòng">
                <Minus size={16} />
              </button>
            </div>
          ))}
          <button className="add-line-button" type="button" onClick={() => setLines([...lines, { ...blankLine }])}>
            <Plus size={16} />
            Thêm dòng sản phẩm
          </button>
        </div>
      </section>

      <aside className="checkout-panel">
        <h2>Thanh toán</h2>
        <div className="charge-list">
          {charges.map((charge, index) => (
            <label key={charge.charge_type}>
              {charge.name}
              <input
                type="number"
                min="0"
                value={charge.amount}
                onChange={(event) =>
                  setCharges(charges.map((item, chargeIndex) => (chargeIndex === index ? { ...item, amount: event.target.value } : item)))
                }
              />
            </label>
          ))}
        </div>
        <label>
          Lý do sửa / ghi chú audit
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: Khách đổi số lượng" />
        </label>
        <label>
          Ghi chú hóa đơn
          <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="summary-lines">
          <div>
            <span>Tổng tiền hàng</span>
            <strong>{money(totals.subtotal)}</strong>
          </div>
          <div>
            <span>Thu khác</span>
            <strong>{money(totals.extra)}</strong>
          </div>
          <div className="summary-total">
            <span>Tổng thanh toán</span>
            <strong>{money(totals.total)}</strong>
          </div>
        </div>
      </aside>
    </form>
  );
}

