import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, test } from "node:test";
import ts from "typescript";

// Exercise the actual TypeScript module without adding a test runtime dependency.
const source = await readFile(new URL("../src/features/salesDraftStorage.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { createSaleDraft, createInvoiceEditDraft, readSaleDraftCollection, writeSaleDraftCollection, saleDraftStorageKey } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const charges = [{ charge_type: "shipping", name: "Phí ship", amount: "30000" }, { charge_type: "packing", name: "Phí đóng hàng", amount: "0" }];
const invoice = {
  id: 42, code: "HD-261004-042", status: "created", sold_at: "2026-10-04T09:00:00", customer_id: 20,
  customer: { id: 20, code: "KH20", name: "Khách kiểm tra", phone: "0900000000" }, note: "Ghi chú gốc",
  discount_amount: "1000", is_paid_by_transfer: true,
  items: [{ product_id: 10, quantity: "2", unit_price: "10000" }],
  extra_charges: [{ charge_type: "shipping", amount: "3000" }],
};

beforeEach(() => {
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
});

test("edit draft retains the original invoice identity and immutable fields", () => {
  const draft = createInvoiceEditDraft(invoice, 2, charges);
  assert.equal(draft.editingInvoice.id, 42);
  assert.equal(draft.editingInvoice.sold_at, invoice.sold_at);
  assert.equal(draft.customerId, "20");
  assert.deepEqual(draft.lines, [{ product_id: "10", quantity: "2", unit_price: "10000" }]);
  assert.equal(draft.discount, "1000");
  assert.equal(draft.isPaidByTransfer, true);
  assert.deepEqual(draft.charges.map((charge) => charge.amount), ["3000", "0"]);
});

test("switching the active tab and reloading preserves independent edit and sale content", () => {
  const edit = createInvoiceEditDraft(invoice, 1, charges);
  edit.lines[0].quantity = "3";
  edit.note = "Chưa lưu sửa";
  const sale = createSaleDraft(2, charges);
  sale.lines = [{ product_id: "10", quantity: "1", unit_price: "12000" }];
  sale.note = "Đơn bán mới";
  const collection = { version: 1, drafts: [edit, sale], activeDraftId: sale.id, nextSequence: 3 };
  writeSaleDraftCollection(1, collection);
  let restored = readSaleDraftCollection(1);
  assert.equal(restored.activeDraftId, sale.id);
  assert.equal(restored.drafts[0].lines[0].quantity, "3");
  assert.equal(restored.drafts[1].note, "Đơn bán mới");
  assert.equal(restored.drafts[1].editingInvoice, undefined);
  writeSaleDraftCollection(1, { ...restored, activeDraftId: edit.id });
  restored = readSaleDraftCollection(1);
  assert.equal(restored.activeDraftId, edit.id);
  assert.equal(restored.drafts[0].editingInvoice.id, 42);
  assert.equal(restored.drafts[0].note, "Chưa lưu sửa");
  assert.equal(invoice.items[0].quantity, "2");
});

test("legacy sales drafts remain compatible", () => {
  const sale = createSaleDraft(5, charges);
  delete sale.discount;
  writeSaleDraftCollection(1, { version: 1, drafts: [sale], activeDraftId: sale.id, nextSequence: 1 });
  const restored = readSaleDraftCollection(1);
  assert.equal(restored.drafts[0].discount, "0");
  assert.equal(restored.nextSequence, 6);
  assert.equal(restored.drafts[0].editingInvoice, undefined);
});

test("invalid edit metadata is discarded rather than becoming a new-sale draft", () => {
  const sale = createSaleDraft(1, charges);
  const invalidEdit = createInvoiceEditDraft({ ...invoice, status: "cancelled" }, 2, charges);
  writeSaleDraftCollection(1, { version: 1, drafts: [sale, invalidEdit], activeDraftId: invalidEdit.id, nextSequence: 3 });
  const restored = readSaleDraftCollection(1);
  assert.equal(restored.drafts.length, 1);
  assert.equal(restored.activeDraftId, sale.id);
});

test("removing a saved edit leaves other tabs and account storage intact", () => {
  const sale = createSaleDraft(1, charges);
  const edit = createInvoiceEditDraft(invoice, 2, charges);
  writeSaleDraftCollection(1, { version: 1, drafts: [sale, edit], activeDraftId: edit.id, nextSequence: 3 });
  writeSaleDraftCollection(2, { version: 1, drafts: [edit], activeDraftId: edit.id, nextSequence: 3 });
  writeSaleDraftCollection(1, { version: 1, drafts: [sale], activeDraftId: sale.id, nextSequence: 3 });
  assert.equal(readSaleDraftCollection(1).drafts.length, 1);
  assert.equal(readSaleDraftCollection(2).drafts[0].editingInvoice.id, 42);
  assert.notEqual(saleDraftStorageKey(1), saleDraftStorageKey(2));
});
