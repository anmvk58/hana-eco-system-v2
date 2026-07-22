import { ChevronDown, ChevronUp, Minus, Plus, Save, Search, Settings } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { InvoiceReceipt } from "../components/InvoiceReceipt";
import { Modal } from "../components/Modal";
import { ToastNotification } from "../components/ToastNotification";
import type { Customer, ExtraChargeSetting, ExtraChargeType, Invoice, InvoiceStatus, Product } from "../types";
import { formatNumberInput, localTimeValue, money, normalizeNumberInput, todayInputValue } from "../utils/format";

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
  { charge_type: "shipping", name: "Phí ship", amount: "0" },
  { charge_type: "packing", name: "Phí đóng hàng", amount: "0" },
  { charge_type: "other", name: "Phụ thu khác", amount: "0" },
];
const blankCustomerForm = {
  code: "",
  name: "",
  phone: "",
  address: "",
  note: "",
};

function buildChargesFromSettings(settings: ExtraChargeSetting[]) {
  return defaultCharges.map((charge) => {
    const setting = settings.find((item) => item.charge_type === charge.charge_type);
    return setting
      ? { charge_type: setting.charge_type, name: charge.name, amount: setting.default_amount }
      : { ...charge };
  });
}

export function InvoiceFormPage() {
  const { hasPermission } = useAuth();
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const editingId = invoiceId ? Number(invoiceId) : null;
  const isEditing = Boolean(editingId);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFocused, setCustomerFocused] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState(blankCustomerForm);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...blankLine }]);
  const [charges, setCharges] = useState<DraftCharge[]>(defaultCharges);
  const [applyShippingFee, setApplyShippingFee] = useState(true);
  const [shippingSettingsOpen, setShippingSettingsOpen] = useState(false);
  const [shippingDefaultAmount, setShippingDefaultAmount] = useState("0");
  const [productSearch, setProductSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!invoiceToPrint) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => window.print());
    });
    const clearPrintedInvoice = () => {
      setToastMessage(`Hóa đơn ${invoiceToPrint.code} đã được lưu.`);
      setInvoiceToPrint(null);
    };
    window.addEventListener("afterprint", clearPrintedInvoice, { once: true });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.removeEventListener("afterprint", clearPrintedInvoice);
    };
  }, [invoiceToPrint]);

  useEffect(() => {
    async function loadBaseData() {
      const [customerData, productData, chargeSettingData] = await Promise.all([
        api.customers.list(),
        api.products.list(),
        api.extraChargeSettings.list(),
      ]);
      setCustomers(customerData);
      setProducts(productData);
      const shipping = chargeSettingData.find((setting) => setting.charge_type === "shipping");
      setShippingDefaultAmount(shipping?.default_amount ?? "0");
      if (!editingId) {
        setCharges(buildChargesFromSettings(chargeSettingData));
      }
    }
    void loadBaseData().catch((err) => setError(err instanceof Error ? err.message : "Không tải được dữ liệu nền"));
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;
    async function loadInvoice() {
      const data = await api.invoices.get(editingId!);
      setInvoice(data);
      setCustomerId(data.customer_id ? String(data.customer_id) : "");
      setCustomerSearch(data.customer ? `${data.customer.phone ?? data.customer.code} - ${data.customer.name}` : "");
      setNote(data.note ?? "");
      setLines(
        data.items.map((item) => ({
          product_id: item.product_id ? String(item.product_id) : "",
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      );
      setCharges(
        defaultCharges.map((charge) => {
          const found = data.extra_charges.find((item) => item.charge_type === charge.charge_type);
          return found ? { charge_type: found.charge_type, name: charge.name, amount: found.amount } : charge;
        }),
      );
      const shippingCharge = data.extra_charges.find((item) => item.charge_type === "shipping");
      setApplyShippingFee(Boolean(shippingCharge && Number(shippingCharge.amount || 0) > 0));
    }
    void loadInvoice().catch((err) => setError(err instanceof Error ? err.message : "Không tải được hóa đơn"));
  }, [editingId]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    if (!keyword) return [];
    return customers.filter((customer) =>
      `${customer.code} ${customer.phone ?? ""} ${customer.name}`.toLowerCase().includes(keyword),
    );
  }, [customerSearch, customers]);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return [];
    return products.filter((product) => `${product.code} ${product.name}`.toLowerCase().includes(keyword));
  }, [productSearch, products]);

  const suggestedProducts = useMemo(() => filteredProducts.slice(0, 8), [filteredProducts]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0);
    const extra = charges.reduce((sum, charge) => {
      if (charge.charge_type === "shipping" && !applyShippingFee) return sum;
      return sum + Number(charge.amount || 0);
    }, 0);
    return { subtotal, extra, total: subtotal + extra };
  }, [lines, charges, applyShippingFee]);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines(
      lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const updated = { ...line, ...patch };
        if (patch.product_id) {
          const product = productMap.get(Number(patch.product_id));
          if (product) updated.unit_price = product.sale_price;
        }
        return updated;
      }),
    );
  }

  function addProductToInvoice(product: Product) {
    const productId = String(product.id);
    const existingIndex = lines.findIndex((line) => line.product_id === productId);
    if (existingIndex >= 0) {
      setLines(
        lines.map((line, index) =>
          index === existingIndex
            ? { ...line, quantity: String(Number(line.quantity || 0) + 1), unit_price: line.unit_price || product.sale_price }
            : line,
        ),
      );
    } else {
      const nextLine = { product_id: productId, quantity: "1", unit_price: product.sale_price };
      const emptyIndex = lines.findIndex((line) => !line.product_id);
      setLines(emptyIndex >= 0 ? lines.map((line, index) => (index === emptyIndex ? nextLine : line)) : [...lines, nextLine]);
    }
    setProductSearch("");
    setSearchFocused(false);
  }

  function handleProductSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchFocused(true);
      if (suggestedProducts.length > 0) {
        setHighlightedProductIndex((current) => (current + 1) % suggestedProducts.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchFocused(true);
      if (suggestedProducts.length > 0) {
        setHighlightedProductIndex((current) => (current - 1 + suggestedProducts.length) % suggestedProducts.length);
      }
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();
    const product = suggestedProducts[highlightedProductIndex] ?? suggestedProducts[0];
    if (!product) {
      setError("Không tìm thấy sản phẩm phù hợp");
      return;
    }
    setError("");
    addProductToInvoice(product);
  }

  function selectCustomer(customer: Customer) {
    setCustomerId(String(customer.id));
    setCustomerSearch(`${customer.phone ?? customer.code} - ${customer.name}`);
    setCustomerFocused(false);
  }

  function openCreateCustomer() {
    const seed = customerSearch.trim();
    setCustomerForm({ ...blankCustomerForm, code: seed, phone: seed });
    setCustomerFocused(false);
    setCustomerModalOpen(true);
  }

  function handleCustomerSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const customer = filteredCustomers[0];
    if (customer) {
      selectCustomer(customer);
      return;
    }
    openCreateCustomer();
  }

  async function createCustomer(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const customer = await api.customers.create(customerForm);
      setCustomers(await api.customers.list());
      selectCustomer(customer);
      setCustomerModalOpen(false);
      setCustomerForm(blankCustomerForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được khách hàng");
    }
  }

  function removeLine(index: number) {
    setLines(lines.length === 1 ? [{ ...blankLine }] : lines.filter((_, lineIndex) => lineIndex !== index));
  }

  function adjustQuantity(index: number, delta: 1 | -1) {
    const current = Number(lines[index]?.quantity || 0);
    if (delta === -1 && current <= 1) return;
    const next = Number((current + delta).toFixed(3));
    updateLine(index, { quantity: String(next) });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setToastMessage("");
    const cleanLines = lines.filter((line) => line.product_id);
    if (cleanLines.length === 0) {
      setError("Hóa đơn cần ít nhất một sản phẩm");
      return;
    }

    const soldAt = isEditing && invoice ? invoice.sold_at : `${todayInputValue()}T${localTimeValue()}`;
    const effectiveCharges = charges.filter((charge) => charge.charge_type !== "shipping" || applyShippingFee);
    const payload = {
      customer_id: isEditing && invoice ? invoice.customer_id ?? null : customerId ? Number(customerId) : null,
      status: "created" as InvoiceStatus,
      sold_at: soldAt,
      note,
      items: cleanLines.map((line) => ({
        product_id: Number(line.product_id),
        quantity: line.quantity,
        unit_price: line.unit_price,
      })),
      extra_charges: effectiveCharges
        .filter((charge) => Number(charge.amount || 0) > 0)
        .map((charge) => ({
          charge_type: charge.charge_type,
          name: charge.name,
          amount: charge.amount,
        })),
      reason: reason || (isEditing ? "Cập nhật hàng hóa và phí hóa đơn" : "Tạo hóa đơn"),
    };

    setSubmitting(true);
    try {
      const saved = isEditing ? await api.invoices.update(editingId!, payload) : await api.invoices.create(payload);
      if (isEditing) {
        navigate(`/invoices/${saved.id}`);
        return;
      }

      setCustomerId("");
      setCustomerSearch("");
      setNote("");
      setReason("");
      setLines([{ ...blankLine }]);
      setProductSearch("");
      setApplyShippingFee(true);
      setCharges((current) => current.map((charge) => ({
        ...charge,
        amount: charge.charge_type === "shipping" ? shippingDefaultAmount : "0",
      })));
      setProducts((current) => current.map((product) => {
        const soldItem = saved.items.find((item) => item.product_id === product.id);
        return soldItem
          ? { ...product, stock_quantity: String(Number(product.stock_quantity) - Number(soldItem.quantity)) }
          : product;
      }));
      if (hasPermission("invoices.print")) {
        setInvoiceToPrint(saved);
      } else {
        setToastMessage(`Hóa đơn ${saved.code} đã được lưu.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được hóa đơn");
    } finally {
      setSubmitting(false);
    }
  }

  function updateCharge(index: number, amount: string) {
    setCharges(charges.map((item, chargeIndex) => (chargeIndex === index ? { ...item, amount } : item)));
  }

  async function saveShippingSettings(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const setting = await api.extraChargeSettings.update("shipping", {
        name: "Phí ship",
        default_amount: shippingDefaultAmount,
        is_active: true,
      });
      setCharges(
        charges.map((charge) =>
          charge.charge_type === "shipping" ? { ...charge, name: setting.name, amount: setting.default_amount } : charge,
        ),
      );
      setApplyShippingFee(true);
      setShippingSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được cài đặt phí ship");
    }
  }

  return (
    <>
      <form className="invoice-workspace" onSubmit={(event) => void submit(event)}>
        <section className="sell-panel">
          <div className="panel-header">
            <div>
              <h2>{isEditing ? `Sửa hóa đơn ${invoice?.code ?? ""}` : "Tạo hóa đơn mới"}</h2>
              <span>{isEditing ? "Chỉ được sửa hàng hóa, số lượng, đơn giá và các khoản phí" : "Chọn sản phẩm, số lượng và các khoản phí phát sinh"}</span>
            </div>
            <button className="primary-button" type="submit" disabled={submitting}>
              <Save size={17} />
              {submitting ? "Đang lưu..." : "Lưu hóa đơn"}
            </button>
          </div>

          {error ? <div className="alert error">{error}</div> : null}

          <div className="sales-search-section">
            <div className="sales-search-field">
              <label htmlFor="customer-search">Khách hàng</label>
              <div className="customer-search-wrapper">
                <div className="line-search">
                  <Search size={17} />
                  <input
                    id="customer-search"
                    disabled={isEditing}
                    value={customerSearch}
                    onBlur={() => window.setTimeout(() => setCustomerFocused(false), 120)}
                    onChange={(event) => {
                      if (isEditing) return;
                      setCustomerSearch(event.target.value);
                      setCustomerId("");
                      setCustomerFocused(true);
                    }}
                    onFocus={() => {
                      if (!isEditing) setCustomerFocused(true);
                    }}
                    onKeyDown={handleCustomerSearchKeyDown}
                    placeholder={isEditing ? "Không cho phép sửa khách hàng" : "Nhập số điện thoại hoặc mã khách hàng; để trống nếu là khách lẻ"}
                  />
                </div>
                {!isEditing && customerFocused && customerSearch.trim() ? (
                  <div className="product-suggestions">
                    {filteredCustomers.slice(0, 8).map((customer) => (
                      <button key={customer.id} type="button" onMouseDown={() => selectCustomer(customer)}>
                        <span>
                          <strong>{customer.phone || customer.code}</strong>
                          {customer.name}
                        </span>
                        <span>{customer.address || customer.code}</span>
                      </button>
                    ))}
                    {filteredCustomers.length === 0 ? (
                      <div className="suggestion-empty">
                        <span>Không tìm thấy khách hàng</span>
                        {hasPermission("customers.create") ? <button className="secondary-button suggestion-action" type="button" onMouseDown={openCreateCustomer}>
                          <Plus size={16} />
                          Tạo khách hàng mới
                        </button> : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="sales-search-field">
              <label htmlFor="product-search">Sản phẩm</label>
              <div className="line-search-wrapper">
                <div className="line-search">
                  <Search size={17} />
                  <input
                    id="product-search"
                    value={productSearch}
                    onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                    onChange={(event) => {
                      setProductSearch(event.target.value);
                      setSearchFocused(true);
                      setHighlightedProductIndex(0);
                    }}
                    onFocus={() => {
                      setSearchFocused(true);
                      setHighlightedProductIndex(0);
                    }}
                    onKeyDown={handleProductSearchKeyDown}
                    placeholder="Nhập mã hoặc tên sản phẩm, bấm Enter để thêm"
                  />
                </div>
                {searchFocused && productSearch.trim() ? (
                  <div className="product-suggestions">
                    {suggestedProducts.map((product, index) => (
                      <button
                        aria-selected={index === highlightedProductIndex}
                        className={index === highlightedProductIndex ? "is-highlighted" : undefined}
                        key={product.id}
                        onMouseDown={() => addProductToInvoice(product)}
                        onMouseEnter={() => setHighlightedProductIndex(index)}
                        type="button"
                      >
                        <span>
                          <strong>{product.code}</strong>
                          {product.name}
                        </span>
                        <span>{money(product.sale_price)}</span>
                      </button>
                    ))}
                    {suggestedProducts.length === 0 ? <div className="suggestion-empty">Không tìm thấy sản phẩm phù hợp</div> : null}
                  </div>
                ) : null}
              </div>
            </div>
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
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code} - {product.name} ({money(product.sale_price)})
                    </option>
                  ))}
                </select>
                <div className="quantity-stepper">
                  <input
                    inputMode="decimal"
                    value={formatNumberInput(line.quantity)}
                    onChange={(event) => updateLine(index, { quantity: normalizeNumberInput(event.target.value) })}
                  />
                  <div className="quantity-stepper-controls">
                    <button type="button" onClick={() => adjustQuantity(index, 1)} aria-label="Tăng số lượng thêm 1">
                      <ChevronUp size={14} />
                    </button>
                    <button type="button" disabled={Number(line.quantity || 0) <= 1} onClick={() => adjustQuantity(index, -1)} aria-label="Giảm số lượng đi 1">
                      <ChevronDown size={14} />
                    </button>
                  </div>
                </div>
                <input
                  inputMode="numeric"
                  value={formatNumberInput(line.unit_price, false)}
                  onChange={(event) => updateLine(index, { unit_price: normalizeNumberInput(event.target.value, false) })}
                />
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
          <div className="checkout-title">
            <h2>Thanh toán</h2>
            {hasPermission("extra_charges.update") ? <button className="icon-button" type="button" onClick={() => setShippingSettingsOpen(true)} aria-label="Cài đặt phí ship mặc định">
              <Settings size={16} />
            </button> : null}
          </div>
          <div className="charge-list">
            {charges.map((charge, index) => (
              <label className={charge.charge_type === "shipping" ? "charge-field shipping-charge" : "charge-field"} key={charge.charge_type}>
                <span className="charge-label-row">
                  <span>{charge.name}</span>
                  {charge.charge_type === "shipping" ? (
                    <span className="toggle-wrap">
                      <span>{applyShippingFee ? "Áp dụng" : "Không áp dụng"}</span>
                      <input
                        checked={applyShippingFee}
                        onChange={(event) => setApplyShippingFee(event.target.checked)}
                        type="checkbox"
                      />
                    </span>
                  ) : null}
                </span>
                <input
                  disabled={charge.charge_type === "shipping" && !applyShippingFee}
                  inputMode="numeric"
                  value={formatNumberInput(charge.amount, false)}
                  onChange={(event) => updateCharge(index, normalizeNumberInput(event.target.value, false))}
                />
              </label>
            ))}
          </div>
          <label>
            Lý do sửa / ghi chú lịch sử
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

      {customerModalOpen ? (
        <Modal
          title="Tạo khách hàng mới"
          onClose={() => {
            setCustomerModalOpen(false);
            setCustomerForm(blankCustomerForm);
          }}
        >
          <form className="form-grid" onSubmit={(event) => void createCustomer(event)}>
            <label>
              Mã khách hàng
              <input required value={customerForm.code} onChange={(event) => setCustomerForm({ ...customerForm, code: event.target.value })} />
            </label>
            <label>
              Số điện thoại
              <input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} />
            </label>
            <label>
              Tên khách hàng
              <input required value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} />
            </label>
            <label>
              Địa chỉ
              <input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} />
            </label>
            <label className="span-2">
              Ghi chú
              <textarea value={customerForm.note} onChange={(event) => setCustomerForm({ ...customerForm, note: event.target.value })} />
            </label>
            <div className="form-actions span-2">
              <button className="secondary-button" type="button" onClick={() => setCustomerForm(blankCustomerForm)}>
                Làm mới
              </button>
              <button className="primary-button" type="submit">
                Lưu khách hàng
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {shippingSettingsOpen ? (
        <Modal title="Cài đặt phí ship mặc định" onClose={() => setShippingSettingsOpen(false)}>
          <form className="form-grid" onSubmit={(event) => void saveShippingSettings(event)}>
            <label className="span-2">
              Phí ship mặc định
              <input
                inputMode="numeric"
                value={formatNumberInput(shippingDefaultAmount, false)}
                onChange={(event) => setShippingDefaultAmount(normalizeNumberInput(event.target.value, false))}
              />
            </label>
            <div className="form-actions span-2">
              <button className="secondary-button" type="button" onClick={() => setShippingSettingsOpen(false)}>
                Hủy
              </button>
              <button className="primary-button" type="submit">
                Lưu cài đặt
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {invoiceToPrint ? <InvoiceReceipt invoice={invoiceToPrint} className="auto-print-receipt" /> : null}
      {toastMessage ? <ToastNotification message={toastMessage} onClose={() => setToastMessage("")} /> : null}
    </>
  );
}
