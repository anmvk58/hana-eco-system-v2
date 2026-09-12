import type { Customer, ExtraChargeType } from "../types";

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
  id: string;
  sequence: number;
  customerId: string;
  customerSearch: string;
  selectedCustomer: Customer | null;
  note: string;
  reason: string;
  lines: SaleDraftLine[];
  charges: SaleDraftCharge[];
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

export function readSaleDraftCollection(userId: number): SaleDraftCollection | null {
  try {
    const raw = window.localStorage.getItem(saleDraftStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaleDraftCollection>;
    if (parsed.version !== 1 || !Array.isArray(parsed.drafts) || parsed.drafts.length === 0) return null;
    const drafts = parsed.drafts.filter((draft): draft is SaleDraft => Boolean(
      draft && typeof draft.id === "string" && typeof draft.sequence === "number" && Array.isArray(draft.lines) && Array.isArray(draft.charges),
    ));
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

