import type { ExternalHandoverBatch } from "../types";

export function handoverNoteText(batch: Pick<ExternalHandoverBatch, "note" | "transfer_note" | "cash_note">): string {
  return [batch.note, batch.transfer_note ? `Chuyển khoản: ${batch.transfer_note}` : null, batch.cash_note ? `Tiền mặt: ${batch.cash_note}` : null].filter(Boolean).join("\n");
}
