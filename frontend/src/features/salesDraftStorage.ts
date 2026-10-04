import type { Customer, ExtraChargeType, Invoice } from "../types";

export interface SaleDraftLine {
  product_id: string;
  quantity: string;
  unit_price: string;
}

export interface SaleDraftCharge {
  charge_type: ExtraChargeType;
  name: string;
  amount: string;
}

export interface SaleDraft {
  editingInvoice?: Invoice;
  id: string;
  sequence: number;
  customerId: string;
  customerSearch: string;
  selectedCustomer: Customer | null;
  note: string;
  reason: string;
  lines: SaleDraftLine[];
  charges: SaleDraftCharge[];
  discount: string;
  applyShippingFee: boolean;
  isPaidByTransfer: boolean;
  printTwoCopies: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaleDraftCollection {
  version: 1;
  activeDraftId: string;
  nextSequence: number;
  drafts: SaleDraft[];
}

const storagePrefix = "hana-sale-drafts:v1";

export function saleDraftStorageKey(userId: number) {
  return `${storagePrefix}:${userId}`;
}

export function createSaleDraft(sequence: number, charges: SaleDraftCharge[]): SaleDraft {
  const now = new Date().toISOString();
  return {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sequence,
    customerId: "",
    customerSearch: "",
    selectedCustomer: null,
    note: "",
    reason: "",
    lines: [],
    charges: charges.map((charge) => ({ ...charge })),
    discount: "0",
    applyShippingFee: true,
    isPaidByTransfer: false,
    printTwoCopies: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSaleDraftCollection(charges: SaleDraftCharge[]): SaleDraftCollection {
  const draft = createSaleDraft(1, charges);
  return { version: 1, activeDraftId: draft.id, nextSequence: 2, drafts: [draft] };
}

export function createInvoiceEditDraft(invoice: Invoice, sequence: number, charges: SaleDraftCharge[]): SaleDraft {
  const draft = createSaleDraft(sequence, charges);
  return {
    ...draft,
    editingInvoice: invoice,
    customerId: invoice.customer_id ? String(invoice.customer_id) : "",
    customerSearch: invoice.customer ? `${invoice.customer.phone ?? invoice.customer.code} - ${invoice.customer.name}` : "",
    selectedCustomer: invoice.customer ?? null,
    note: invoice.note ?? "",
    discount: invoice.discount_amount,
    isPaidByTransfer: invoice.is_paid_by_transfer,
    lines: invoice.items.map((item) => ({ product_id: item.product_id ? String(item.product_id) : "", quantity: item.quantity, unit_price: item.unit_price })),
    charges: charges.map((charge) => {
      const found = invoice.extra_charges.find((item) => item.charge_type === charge.charge_type);
      return found ? { ...charge, amount: found.amount } : { ...charge, amount: "0" };
    }),
    applyShippingFee: invoice.extra_charges.some((charge) => charge.charge_type === "shipping" && Number(charge.amount) > 0),
  };
}

export function readSaleDraftCollection(userId: number): SaleDraftCollection | null {
  try {
    const raw = window.localStorage.getItem(saleDraftStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaleDraftCollection>;
    if (parsed.version !== 1 || !Array.isArray(parsed.drafts) || parsed.drafts.length === 0) return null;
    const drafts = parsed.drafts.filter((draft): draft is SaleDraft => Boolean(
      draft && typeof draft.id === "string" && typeof draft.sequence === "number" && Array.isArray(draft.lines) && Array.isArray(draft.charges)
      && (!draft.editingInvoice || (Number.isInteger(draft.editingInvoice.id) && draft.editingInvoice.id > 0 && draft.editingInvoice.status === "created" && !draft.editingInvoice.deleted_at && typeof draft.editingInvoice.code === "string" && typeof draft.editingInvoice.sold_at === "string" && Array.isArray(draft.editingInvoice.items))),
    )).map((draft) => ({ ...draft, discount: typeof draft.discount === "string" ? draft.discount : "0" }));
    if (drafts.length === 0) return null;
    const activeDraftId = drafts.some((draft) => draft.id === parsed.activeDraftId) ? parsed.activeDraftId! : drafts[0].id;
    const highestSequence = Math.max(...drafts.map((draft) => draft.sequence));
    return {
      version: 1,
      activeDraftId,
      nextSequence: Math.max(Number(parsed.nextSequence) || 1, highestSequence + 1),
      drafts,
    };
  } catch {
    return null;
  }
}

export function writeSaleDraftCollection(userId: number, collection: SaleDraftCollection) {
  window.localStorage.setItem(saleDraftStorageKey(userId), JSON.stringify(collection));
}
