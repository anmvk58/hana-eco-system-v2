import { Minus, Plus, Save, Search, Settings } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api/client";
import { Modal } from "../components/Modal";
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
  { charge_type: "shipping", name: "Phi ship", amount: "0" },
  { charge_type: "packing", name: "Phi dong hang", amount: "0" },
  { charge_type: "other", name: "Phu thu khac", amount: "0" },
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
      ? { charge_type: setting.charge_type, name: setting.name, amount: setting.default_amount }
      : { ...charge };
  });
}

export function InvoiceFormPage() {
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
  const [status, setStatus] = useState<InvoiceStatus>("draft");
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
    void loadBaseData().catch((err) => setError(err instanceof Error ? err.message : "Khong tai duoc du lieu nen"));
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;
    async function loadInvoice() {
      const data = await api.invoices.get(editingId!);
      setInvoice(data);
      setCustomerId(data.customer_id ? String(data.customer_id) : "");
      setCustomerSearch(data.customer ? `${data.customer.phone ?? data.customer.code} - ${data.customer.name}` : "");
      setStatus(data.status);
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
          return found ? { charge_type: found.charge_type, name: found.name, amount: found.amount } : charge;
        }),
      );
      const shippingCharge = data.extra_charges.find((item) => item.charge_type === "shipping");
      setApplyShippingFee(Boolean(shippingCharge && Number(shippingCharge.amount || 0) > 0));
    }
    void loadInvoice().catch((err) => setError(err instanceof Error ? err.message : "Khong tai duoc hoa don"));
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
      setError("Khong tim thay san pham phu hop");
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
      setError(err instanceof Error ? err.message : "Khong tao duoc khach hang");
    }
  }

  function removeLine(index: number) {
    setLines(lines.length === 1 ? [{ ...blankLine }] : lines.filter((_, lineIndex) => lineIndex !== index));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const cleanLines = lines.filter((line) => line.product_id);
    if (cleanLines.length === 0) {
      setError("Hoa don can it nhat mot san pham");
      return;
    }

    const soldAt = isEditing && invoice ? invoice.sold_at : `${todayInputValue()}T${localTimeValue()}`;
    const effectiveCharges = charges.filter((charge) => charge.charge_type !== "shipping" || applyShippingFee);
    const payload = {
      customer_id: isEditing && invoice ? invoice.customer_id ?? null : customerId ? Number(customerId) : null,
      status: isEditing ? status : "draft",
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
      reason: reason || (isEditing ? "Cap nhat hang hoa va phi hoa don" : "Tao hoa don"),
    };

    try {
      const saved = isEditing ? await api.invoices.update(editingId!, payload) : await api.invoices.create(payload);
      if (!isEditing) setApplyShippingFee(true);
      navigate(`/invoices/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Khong luu duoc hoa don");
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
        name: "Phi ship",
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
      setError(err instanceof Error ? err.message : "Khong luu duoc cai dat phi ship");
    }
  }

  return (
    <>
      <form className="invoice-workspace" onSubmit={(event) => void submit(event)}>
        <section className="sell-panel">
          <div className="panel-header">
            <div>
              <h2>{isEditing ? `Sua hoa don ${invoice?.code ?? ""}` : "Tao hoa don moi"}</h2>
              <span>{isEditing ? "Chi duoc sua hang hoa, so luong, don gia va cac khoan phi" : "Chon san pham, so luong, phi phat sinh va trang thai don"}</span>
            </div>
            <button className="primary-button" type="submit">
              <Save size={17} />
              Luu hoa don
            </button>
          </div>

          {error ? <div className="alert error">{error}</div> : null}

          <div className="invoice-meta">
            <label>
              Khach hang
              <div className="customer-search-wrapper">
                <div className="line-search">
                  <Search size={17} />
                  <input
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
                    placeholder={isEditing ? "Khong cho phep sua khach hang" : "Nhap so dien thoai/ma khach hang, de trong la Khach le"}
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
                        <span>Khong tim thay khach hang</span>
                        <button className="secondary-button suggestion-action" type="button" onMouseDown={openCreateCustomer}>
                          <Plus size={16} />
                          Tao khach hang moi
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </label>
          </div>

          <div className="line-search-wrapper">
            <div className="line-search">
              <Search size={17} />
              <input
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
                placeholder="Nhap ma hoac ten san pham, bam Enter de them"
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
                {suggestedProducts.length === 0 ? <div className="suggestion-empty">Khong tim thay san pham phu hop</div> : null}
              </div>
            ) : null}
          </div>

          <div className="line-table">
            <div className="line-head">
              <span>San pham</span>
              <span>So luong</span>
              <span>Don gia</span>
              <span>Thanh tien</span>
              <span></span>
            </div>
            {lines.map((line, index) => (
              <div className="line-row" key={`${index}-${line.product_id}`}>
                <select value={line.product_id} onChange={(event) => updateLine(index, { product_id: event.target.value })}>
                  <option value="">Chon san pham</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code} - {product.name} ({money(product.sale_price)})
                    </option>
                  ))}
                </select>
                <input
                  inputMode="decimal"
                  value={formatNumberInput(line.quantity)}
                  onChange={(event) => updateLine(index, { quantity: normalizeNumberInput(event.target.value) })}
                />
                <input
                  inputMode="numeric"
                  value={formatNumberInput(line.unit_price, false)}
                  onChange={(event) => updateLine(index, { unit_price: normalizeNumberInput(event.target.value, false) })}
                />
                <strong>{money(Number(line.quantity || 0) * Number(line.unit_price || 0))}</strong>
                <button className="icon-button danger" type="button" onClick={() => removeLine(index)} aria-label="Xoa dong">
                  <Minus size={16} />
                </button>
              </div>
            ))}
            <button className="add-line-button" type="button" onClick={() => setLines([...lines, { ...blankLine }])}>
              <Plus size={16} />
              Them dong san pham
            </button>
          </div>
        </section>

        <aside className="checkout-panel">
          <div className="checkout-title">
            <h2>Thanh toan</h2>
            <button className="icon-button" type="button" onClick={() => setShippingSettingsOpen(true)} aria-label="Cai dat phi ship mac dinh">
              <Settings size={16} />
            </button>
          </div>
          <div className="charge-list">
            {charges.map((charge, index) => (
              <label className={charge.charge_type === "shipping" ? "charge-field shipping-charge" : "charge-field"} key={charge.charge_type}>
                <span className="charge-label-row">
                  <span>{charge.name}</span>
                  {charge.charge_type === "shipping" ? (
                    <span className="toggle-wrap">
                      <span>{applyShippingFee ? "Ap dung" : "Khong ap dung"}</span>
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
            Ly do sua / ghi chu audit
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Vi du: Khach doi so luong" />
          </label>
          <label>
            Ghi chu hoa don
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="summary-lines">
            <div>
              <span>Tong tien hang</span>
              <strong>{money(totals.subtotal)}</strong>
            </div>
            <div>
              <span>Thu khac</span>
              <strong>{money(totals.extra)}</strong>
            </div>
            <div className="summary-total">
              <span>Tong thanh toan</span>
              <strong>{money(totals.total)}</strong>
            </div>
          </div>
        </aside>
      </form>

      {customerModalOpen ? (
        <Modal
          title="Tao khach hang moi"
          onClose={() => {
            setCustomerModalOpen(false);
            setCustomerForm(blankCustomerForm);
          }}
        >
          <form className="form-grid" onSubmit={(event) => void createCustomer(event)}>
            <label>
              Ma khach hang
              <input required value={customerForm.code} onChange={(event) => setCustomerForm({ ...customerForm, code: event.target.value })} />
            </label>
            <label>
              So dien thoai
              <input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} />
            </label>
            <label>
              Ten khach hang
              <input required value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} />
            </label>
            <label>
              Dia chi
              <input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} />
            </label>
            <label className="span-2">
              Ghi chu
              <textarea value={customerForm.note} onChange={(event) => setCustomerForm({ ...customerForm, note: event.target.value })} />
            </label>
            <div className="form-actions span-2">
              <button className="secondary-button" type="button" onClick={() => setCustomerForm(blankCustomerForm)}>
                Lam moi
              </button>
              <button className="primary-button" type="submit">
                Luu khach hang
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {shippingSettingsOpen ? (
        <Modal title="Cai dat phi ship mac dinh" onClose={() => setShippingSettingsOpen(false)}>
          <form className="form-grid" onSubmit={(event) => void saveShippingSettings(event)}>
            <label className="span-2">
              Phi ship mac dinh
              <input
                inputMode="numeric"
                value={formatNumberInput(shippingDefaultAmount, false)}
                onChange={(event) => setShippingDefaultAmount(normalizeNumberInput(event.target.value, false))}
              />
            </label>
            <div className="form-actions span-2">
              <button className="secondary-button" type="button" onClick={() => setShippingSettingsOpen(false)}>
                Huy
              </button>
              <button className="primary-button" type="submit">
                Luu cai dat
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
