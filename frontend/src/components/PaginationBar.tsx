import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export function PaginationBar({
  total,
  page,
  pageSize,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return start + index;
  });

  if (total === 0) return null;
  return <section className="pagination-bar" aria-label="Phân trang">
    <span className="pagination-summary">Hiển thị {firstItem}–{lastItem} trong {total} {itemLabel}</span>
    <label className="page-size-control"><span>Số bản ghi / trang</span><select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label="Số bản ghi trên mỗi trang">{PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
    <div className="pagination-controls">
      <button type="button" className="pagination-button" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Trang trước"><ChevronLeft size={17}/></button>
      {pages.map((pageNumber) => <button key={pageNumber} type="button" className={`pagination-button${pageNumber === page ? " active" : ""}`} onClick={() => onPageChange(pageNumber)} aria-current={pageNumber === page ? "page" : undefined}>{pageNumber}</button>)}
      <button type="button" className="pagination-button" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} aria-label="Trang sau"><ChevronRight size={17}/></button>
    </div>
  </section>;
}
