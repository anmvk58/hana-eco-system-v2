import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

import posLogo from "../assets/pos_logo2.png";
import type { Invoice } from "../types";
import { numberText } from "../utils/format";

export function InvoiceReceipt({ invoice, className = "" }: { invoice: Invoice; className?: string }) {
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!barcodeRef.current) return;
    JsBarcode(barcodeRef.current, invoice.code, {
      displayValue: false,
      format: "CODE128",
      height: 44,
      margin: 0,
      width: 1.4,
    });
  }, [invoice.code]);

  const customerName = invoice.customer?.name ?? "Khách lẻ";
  const customerPhone = invoice.customer?.phone || "-";
  const customerAddress = invoice.customer?.address || "-";
  const soldDate = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(invoice.sold_at));
  const soldTime = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(invoice.sold_at));
  const shippingFee = invoice.extra_charges.find((charge) => charge.charge_type === "shipping")?.amount ?? "0";
  const packingFee = invoice.extra_charges.find((charge) => charge.charge_type === "packing")?.amount ?? "0";
  const otherFees = invoice.extra_charges
    .filter((charge) => charge.charge_type === "other")
    .reduce((sum, charge) => sum + Number(charge.amount), 0);

  return (
    <section className={`print-area receipt-k80 ${className}`.trim()}>
      <img className="k80-shop-logo" src={posLogo} alt="Hana Fruits" />
      <div className="k80-phone">Điện thoại: 0788.349.222</div>

      <div className="k80-title">
        <strong>HÓA ĐƠN BÁN HÀNG</strong>
        <span>Số HĐ: {invoice.code}</span>
        <span>Ngày {soldDate}</span>
        <span>{soldTime}</span>
      </div>

      <div className="k80-customer">
        <div>Khách hàng: {customerName}</div>
        <div>SĐT: {customerPhone}</div>
        <div>Địa chỉ: {customerAddress}</div>
        <div>Ghi chú: {invoice.note || ""}</div>
      </div>

      <div className="k80-items">
        <div className="k80-item-head">
          <strong>Đơn giá</strong>
          <strong>SL</strong>
          <strong>Thành tiền</strong>
        </div>
        {invoice.items.map((item) => (
          <div className="k80-item" key={item.id}>
            <div className="k80-item-name">{item.product_name}</div>
            <div className="k80-item-values">
              <span>{numberText(item.unit_price)}</span>
              <span>{numberText(item.quantity, 3)}</span>
              <span>{numberText(item.line_total)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="k80-totals">
        <div><span>Tổng tiền hàng:</span><strong>{numberText(invoice.subtotal)}</strong></div>
        <div><span>Giảm giá:</span><strong>0</strong></div>
        <div><span>Phí ship:</span><strong>{numberText(shippingFee)}</strong></div>
        {Number(packingFee) > 0 ? <div><span>Phí đóng hàng:</span><strong>{numberText(packingFee)}</strong></div> : null}
        {otherFees > 0 ? <div><span>Phụ thu khác:</span><strong>{numberText(otherFees)}</strong></div> : null}
        <div><span>Tổng thanh toán:</span><strong>{numberText(invoice.total_amount)}</strong></div>
      </div>

      <div className="k80-notes">
        <p>- Bảo hành 100% nếu có vấn đề xảy ra khi nhận hàng.</p>
        <p>- Vui lòng kiểm tra sản phẩm và báo shop tình trạng gặp hỏng trong ngày.</p>
        <p>- Không nhận bảo hành sản phẩm qua ngày, xin quý khách thông cảm.</p>
      </div>

      <div className="k80-thanks">Cảm ơn quý khách và hẹn gặp lại!</div>
      <svg className="k80-barcode" ref={barcodeRef} aria-label={`Barcode ${invoice.code}`} role="img" />
    </section>
  );
}
