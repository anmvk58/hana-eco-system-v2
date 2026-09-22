import { ChevronLeft, ChevronRight, FileText, LoaderCircle, Search, XCircle } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DateRangePicker } from "../components/DateRangePicker";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { AuditBadge } from "../components/AuditBadge";
import type { Invoice, InvoiceListItem, InvoiceStatus } from "../types";
import { dateTime, normalizeInvoiceCodeSearch, numberText, todayInputValue } from "../utils/format";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
type InvoiceStatusFilter = InvoiceStatus | "active" | "all";

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function InvoicesPage() {
  const { hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const initialStatus = searchParams.get("status");
  const [status, setStatus] = useState<InvoiceStatusFilter>(
    initialStatus === "created" || initialStatus === "completed" || initialStatus === "cancelled" || initialStatus === "all"
      ? initialStatus
      : "active",
  );
  const [fromDate, setFromDate] = useState(searchParams.get("from_date") ?? todayInputValue());
  const [toDate, setToDate] = useState(searchParams.get("to_date") ?? todayInputValue());
  const initialInvoiceCode = normalizeInvoiceCodeSearch(searchParams.get("code") ?? "");
  const initialCustomerPhone = searchParams.get("customer_phone") ?? "";
  const [invoiceCode, setInvoiceCode] = useState(initialInvoiceCode);
  const [customerPhone, setCustomerPhone] = useState(initialCustomerPhone);
  const [appliedInvoiceCode, setAppliedInvoiceCode] = useState(initialInvoiceCode);
  const [appliedCustomerPhone, setAppliedCustomerPhone] = useState(initialCustomerPhone);
  const [page, setPage] = useState(positiveInteger(searchParams.get("page"), 1));
  const initialPageSize = positiveInteger(searchParams.get("page_size"), 20);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS.includes(initialPageSize) ? initialPageSize : 20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState("");
  const [cancellingInvoice, setCancellingInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState("Khách hủy đơn");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const loadRequestId = useRef(0);

  async function loadInvoices(
    requestedPage = page,
    requestedPageSize = pageSize,
    selectedStatus = status,
    selectedFromDate = fromDate,
    selectedToDate = toDate,
    selectedInvoiceCode = appliedInvoiceCode,
    selectedCustomerPhone = appliedCustomerPhone,
  ) {
    const normalizedInvoiceCode = normalizeInvoiceCodeSearch(selectedInvoiceCode);
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await api.invoices.list({
          status: selectedStatus === "created" || selectedStatus === "completed" || selectedStatus === "cancelled" ? selectedStatus : undefined,
          exclude_cancelled: selectedStatus === "active" ? true : undefined,
          code: normalizedInvoiceCode || undefined,
          customer_phone: selectedCustomerPhone.trim() || undefined,
          from_date: selectedFromDate || undefined,
          to_date: selectedToDate || undefined,
          page: requestedPage,
          page_size: requestedPageSize,
        });
      if (requestId !== loadRequestId.current) return;
      setInvoices(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      if (requestedPage !== data.page) {
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.set("page", String(data.page));
        nextSearchParams.set("page_size", String(requestedPageSize));
        setPage(data.page);
        setSearchParams(nextSearchParams, { replace: true });
      }
      setRefreshVersion((version) => version + 1);
    } catch (err) {
      if (requestId !== loadRequestId.current) return;
      setError(err instanceof Error ? err.message : "Không tải được hóa đơn");
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvoices();
  }, []);

  function applyFilters(
    selectedStatus: InvoiceStatusFilter,
    selectedFromDate: string,
    selectedToDate: string,
    selectedInvoiceCode = invoiceCode,
    selectedCustomerPhone = customerPhone,
  ) {
    const normalizedInvoiceCode = normalizeInvoiceCodeSearch(selectedInvoiceCode);
    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set("status", selectedStatus);
    if (selectedFromDate) nextSearchParams.set("from_date", selectedFromDate);
    if (selectedToDate) nextSearchParams.set("to_date", selectedToDate);
    if (normalizedInvoiceCode) nextSearchParams.set("code", normalizedInvoiceCode);
    if (selectedCustomerPhone.trim()) nextSearchParams.set("customer_phone", selectedCustomerPhone.trim());
    nextSearchParams.set("page", "1");
    nextSearchParams.set("page_size", String(pageSize));
    setStatus(selectedStatus);
    setFromDate(selectedFromDate);
    setToDate(selectedToDate);
    setInvoiceCode(normalizedInvoiceCode);
    setAppliedInvoiceCode(normalizedInvoiceCode);
    setAppliedCustomerPhone(selectedCustomerPhone.trim());
    setPage(1);
    setSearchParams(nextSearchParams, { replace: true });
    void loadInvoices(
      1,
      pageSize,
      selectedStatus,
      selectedFromDate,
      selectedToDate,
      normalizedInvoiceCode,
      selectedCustomerPhone,
    );
  }

  function changeDateRange(selectedFromDate: string, selectedToDate: string) {
    setFromDate(selectedFromDate);
    setToDate(selectedToDate);
    const rangeIsComplete = Boolean(selectedFromDate && selectedToDate);
    const rangeWasCleared = !selectedFromDate && !selectedToDate;
    if (rangeIsComplete || rangeWasCleared) {
      applyFilters(
        status,
        selectedFromDate,
        selectedToDate,
        invoiceCode,
        customerPhone,
      );
    }
  }

  function searchInvoices() {
    applyFilters(status, fromDate, toDate, invoiceCode, customerPhone);
  }

  function changePage(nextPage: number) {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("page", String(nextPage));
    nextSearchParams.set("page_size", String(pageSize));
    setPage(nextPage);
    setSearchParams(nextSearchParams, { replace: true });
    void loadInvoices(nextPage, pageSize);
  }

  function changePageSize(nextPageSize: number) {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("page", "1");
    nextSearchParams.set("page_size", String(nextPageSize));
    setPage(1);
    setPageSize(nextPageSize);
    setSearchParams(nextSearchParams, { replace: true });
    void loadInvoices(1, nextPageSize);
  }

  function openCancelModal(invoice: Invoice) {
    setCancellingInvoice(invoice);
    setCancelReason("Khách hủy đơn");
    setCancelError("");
  }

  function closeCancelModal() {
    if (cancelling) return;
    setCancellingInvoice(null);
    setCancelError("");
  }

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancellingInvoice) return;
    if (!cancelReason.trim()) {
      setCancelError("Vui lòng nhập lý do hủy hóa đơn");
      return;
    }
    setCancelling(true);
    setCancelError("");
    try {
      await api.invoices.cancel(cancellingInvoice.id, cancelReason.trim());
      setCancellingInvoice(null);
      await loadInvoices();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Không hủy được hóa đơn");
    } finally {
      setCancelling(false);
    }
  }

  const currentPage = Math.min(page, totalPages);
  const firstIndex = (currentPage - 1) * pageSize;
  const visiblePageStart = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const visiblePageEnd = Math.min(totalPages, visiblePageStart + 4);
  const visiblePages = Array.from(
    { length: visiblePageEnd - visiblePageStart + 1 },
    (_, index) => visiblePageStart + index,
  );

  return (
    <div className="page-stack">
      <section className="toolbar">
        <div className="search-box invoice-search-box">
          <Search size={17} />
          <input
            value={invoiceCode}
            onChange={(event) => setInvoiceCode(event.target.value)}
            maxLength={60}
            onKeyDown={(event) => {
              if (event.key === "Enter") searchInvoices();
            }}
            placeholder="Tìm theo mã hóa đơn"
            aria-label="Tìm theo mã hóa đơn"
          />
        </div>
        <div className="search-box invoice-search-box">
          <Search size={17} />
          <input
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            maxLength={30}
            onKeyDown={(event) => {
              if (event.key === "Enter") searchInvoices();
            }}
            placeholder="Tìm theo số điện thoại"
            aria-label="Tìm theo số điện thoại khách hàng"
          />
        </div>
        <button className="secondary-button" type="button" disabled={loading} onClick={searchInvoices}>
          <Search size={17} />
          Tìm kiếm
        </button>
        <select
          value={status}
          onChange={(event) => applyFilters(event.target.value as InvoiceStatusFilter, fromDate, toDate)}
        >
          <option value="active">Đang hiệu lực</option>
          <option value="all">Tất cả trạng thái</option>
          <option value="created">Đã tạo</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã hủy</option>
        </select>
        <DateRangePicker from={fromDate} to={toDate} onChange={changeDateRange} />
        {loading ? <span className="invoice-filter-loading" role="status">
          <LoaderCircle className="loading-spinner" size={17} />
          Đang tải...
        </span> : null}
      </section>

      <div className={`invoice-filter-result-count${loading ? " loading" : ""}`} role="status" aria-live="polite">
        <FileText size={16} />
        <span>{loading ? "Đang cập nhật số lượng hóa đơn..." : <>Tìm thấy <strong>{numberText(total)}</strong> hóa đơn phù hợp với bộ lọc</>}</span>
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="table-panel invoice-table-refresh" key={refreshVersion}>
        <table className="data-table invoice-list-table">
          <thead>
            <tr>
              <th className="invoice-code-column">Mã hóa đơn</th>
              <th className="invoice-revision-column">Rev</th>
              <th className="invoice-sold-at-column">Ngày bán</th>
              <th>Khách hàng</th>
              <th className="invoice-phone-column">Số điện thoại</th>
              <th className="invoice-address-column">Địa chỉ</th>
              <th>Trạng thái</th>
              <th>Audit</th>
              <th className="numeric">Tiền hàng</th>
              <th className="numeric">Thu khác</th>
              <th className="numeric">Tổng thanh toán</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="code-cell invoice-code-column">
                  <Link
                    to={`/invoices/${invoice.id}`}
                    state={{ invoiceListSearch: searchParams.toString() }}
                  >
                    {invoice.code}
                  </Link>
                </td>
                <td className="invoice-revision-column">
                  {invoice.revision > 0 ? (
                    <strong className="invoice-revision-value">.{String(invoice.revision).padStart(2, "0")}</strong>
                  ) : null}
                </td>
                <td className="invoice-sold-at-column">{dateTime(invoice.sold_at)}</td>
                <td>{invoice.customer?.name ?? "Khách lẻ"}</td>
                <td className="invoice-phone-column">{invoice.customer?.phone ?? ""}</td>
                <td className="invoice-address-column">{invoice.customer?.address || "-"}</td>
                <td>
                  <StatusBadge status={invoice.status} />
                </td>
                <td><AuditBadge label={invoice.audit_label} /></td>
                <td className="numeric">{numberText(invoice.subtotal)}</td>
                <td className="numeric">{numberText(invoice.total_extra_charges)}</td>
                <td className="numeric strong">{numberText(invoice.total_amount)}</td>
                <td className="row-actions">
                  <Link
                    className="invoice-list-action-button invoice-list-view-button"
                    to={`/invoices/${invoice.id}`}
                    state={{ invoiceListSearch: searchParams.toString() }}
                    aria-label="Xem"
                    title="Xem hóa đơn"
                  >
                    Xem
                  </Link>
                  {hasPermission("invoices.update") && invoice.status === "created" ? (
                    <Link
                      className="invoice-list-action-button invoice-list-edit-button"
                      to={`/invoices/${invoice.id}/edit`}
                      state={{ invoiceListSearch: searchParams.toString() }}
                      aria-label="Sửa hóa đơn"
                      title="Sửa hóa đơn"
                    >
                      Sửa
                    </Link>
                  ) : null}
                  {hasPermission("invoices.cancel") && invoice.status === "created" ? <button className="icon-button danger" type="button" onClick={() => openCancelModal(invoice)} aria-label="Hủy hóa đơn">
                    <XCircle size={16} />
                  </button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 ? <EmptyState title="Chưa có hóa đơn" description="Tạo hóa đơn bán hàng để xem dữ liệu tại đây." /> : null}
      </section>

      {total > 0 ? <section className="pagination-bar" aria-label="Phân trang hóa đơn">
        <span className="pagination-summary">
          Hiển thị {firstIndex + 1}–{Math.min(firstIndex + pageSize, total)} trong {total} hóa đơn
        </span>
        <label className="page-size-control">
          <span>Số bản ghi / trang</span>
          <select
            value={pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
            aria-label="Số bản ghi trên mỗi trang"
          >
            {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="pagination-controls">
          <button
            type="button"
            className="pagination-button"
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
            aria-label="Trang trước"
          >
            <ChevronLeft size={17} />
          </button>
          {visiblePages.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              className={`pagination-button${pageNumber === currentPage ? " active" : ""}`}
              onClick={() => changePage(pageNumber)}
              aria-current={pageNumber === currentPage ? "page" : undefined}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            className="pagination-button"
            disabled={currentPage === totalPages}
            onClick={() => changePage(currentPage + 1)}
            aria-label="Trang sau"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </section> : null}

      {cancellingInvoice ? (
        <Modal title="Xác nhận hủy hóa đơn" className="invoice-cancel-modal" onClose={closeCancelModal}>
          <form className="invoice-cancel-form" onSubmit={(event) => void cancel(event)}>
            <section className="invoice-cancel-summary">
              <span className="invoice-cancel-summary-icon"><XCircle size={24} /></span>
              <div>
                <small>Hóa đơn cần hủy</small>
                <strong>{cancellingInvoice.code}</strong>
                <span>{cancellingInvoice.customer?.name ?? "Khách lẻ"} · {numberText(cancellingInvoice.total_amount)}</span>
              </div>
            </section>
            {cancelError ? <div className="alert error">{cancelError}</div> : null}
            <label className="invoice-cancel-reason">
              <span>Lý do hủy hóa đơn</span>
              <input
                autoFocus
                value={cancelReason}
                onChange={(event) => {
                  setCancelReason(event.target.value);
                  setCancelError("");
                }}
                disabled={cancelling}
                placeholder="Nhập lý do hủy hóa đơn"
              />
              <small>Lý do này sẽ được lưu vào lịch sử hóa đơn.</small>
            </label>
            <div className="invoice-cancel-warning">
              <XCircle size={18} />
              <span>Hóa đơn sau khi hủy sẽ không thể chỉnh sửa và số lượng hàng sẽ được hoàn lại kho.</span>
            </div>
            <div className="form-actions">
              <button className="secondary-button" type="button" disabled={cancelling} onClick={closeCancelModal}>Hủy</button>
              <button className="primary-button danger-confirm-button" type="submit" disabled={cancelling || !cancelReason.trim()}>
                {cancelling ? "Đang hủy..." : "OK"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

