import { todayInputValue, dateOnly, parseCalendarDate, calendarDateValue, shiftCalendarDate } from "../utils/time";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  mode?: "range" | "single";
  ariaLabel?: string;
  disabled?: boolean;
  max?: string;
}

const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const isoDate = (date: Date) => calendarDateValue(date);
const displayDate = (value: string) => value ? dateOnly(value) : "";
const monthOf = (value: string) => {
  const date = parseCalendarDate(value || todayInputValue());
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

export function DateRangePicker({ from, to, onChange, mode = "range", ariaLabel, disabled = false, max }: DateRangePickerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthOf(from || to));
  const [hoverDate, setHoverDate] = useState("");
  const [popoverPosition, setPopoverPosition] = useState({ left: 0, top: 0 });
  const today = todayInputValue();
  const single = mode === "single";

  function close(restoreFocus = false) {
    setOpen(false); setHoverDate("");
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) { setOpen(false); setHoverDate(""); }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); setOpen(false); setHoverDate("");
        triggerRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const bounds = wrapperRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (bounds && panel) setPopoverPosition({
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - 12 - panel.offsetWidth)),
        top: Math.max(12, Math.min(bounds.bottom + 10, window.innerHeight - 12 - panel.offsetHeight)),
      });
    }
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth(), 1));
    const start = new Date(first);
    start.setUTCDate(1 - (first.getUTCDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start); day.setUTCDate(start.getUTCDate() + index); return day;
    });
  }, [visibleMonth]);

  const label = single ? displayDate(from) || "Chọn ngày" : from && to ? `${displayDate(from)} – ${displayDate(to)}`
    : from ? `${displayDate(from)} – Chọn ngày kết thúc` : to ? `Đến ${displayDate(to)}` : "Tất cả thời gian";
  const yesterday = shiftCalendarDate(today, -1);
  const presets = [
    { name: "Hôm nay", start: today, end: today },
    { name: "Hôm qua", start: yesterday, end: yesterday },
    { name: "7 ngày qua", start: shiftCalendarDate(today, -6), end: today },
    { name: "Tháng này", start: isoDate(monthOf(today)), end: today },
    { name: "Tất cả", start: "", end: "" },
  ];
  const visiblePresets = single ? presets.slice(0, 2) : presets;
  const preview = !single && Boolean(from && !to && hoverDate);
  const start = preview && hoverDate < from ? hoverDate : from;
  const end = preview ? (hoverDate > from ? hoverDate : from) : to;

  function selectDay(day: Date) {
    const selected = isoDate(day);
    if (max && selected > max) return;
    setHoverDate("");
    if (single) { onChange(selected, selected); close(true); return; }
    if (!from || to) { onChange(selected, ""); return; }
    onChange(selected < from ? selected : from, selected < from ? from : selected);
    close(true);
  }

  return <div className={`date-range-picker modern-date-range${single ? " single-date-picker" : ""}`} ref={wrapperRef}>
    <div className="date-range-control">
      <button ref={triggerRef} className={`date-range-trigger${open ? " open" : ""}${from || to ? " has-range" : ""}`} type="button" disabled={disabled} aria-label={ariaLabel} aria-expanded={open} aria-haspopup="dialog" onClick={() => {
        if (open) close(); else { setVisibleMonth(monthOf(from || to || today)); setOpen(true); }
      }}><CalendarDays size={18}/><span>{label}</span>{single || (!from && !to) ? <ChevronDown size={15}/> : null}</button>
      {!single && (from || to) ? <button className="date-range-clear" type="button" aria-label="Xóa khoảng thời gian" onClick={() => { onChange("", ""); close(true); }}><X size={15}/></button> : null}
    </div>
    {open ? <div ref={panelRef} className="date-range-popover" style={{ "--date-popover-left": `${popoverPosition.left}px`, "--date-popover-top": `${popoverPosition.top}px` } as CSSProperties} role="dialog" aria-label={single ? "Chọn ngày" : "Chọn khoảng thời gian"}>
      <div className="date-range-heading"><div><strong>{single ? ariaLabel || "Chọn ngày" : "Khoảng thời gian"}</strong><span>{single ? "Chọn một ngày trên lịch" : "Chọn ngày để lọc dữ liệu"}</span></div><button type="button" aria-label="Đóng bộ chọn ngày" onClick={() => close(true)}><X size={17}/></button></div>
      <div className="date-range-presets">{visiblePresets.map((preset) => {
        const active = from === preset.start && to === preset.end;
        return <button type="button" className={active ? "active" : ""} aria-pressed={active} disabled={Boolean(max && preset.end > max)} key={preset.name} onClick={() => {
          onChange(preset.start, preset.end); setVisibleMonth(monthOf(preset.start || today)); close(true);
        }}>{active ? <Check size={13}/> : null}{preset.name}</button>;
      })}</div>
      {!single ? <div className="date-range-values"><div className={!from || to ? "choosing" : ""}><small>Từ ngày</small><strong>{displayDate(from) || "Chưa chọn"}</strong></div><span>→</span><div className={from && !to ? "choosing" : ""}><small>Đến ngày</small><strong>{displayDate(to) || "Chưa chọn"}</strong></div></div> : null}
      <div className="date-range-calendar-header"><button type="button" aria-label="Tháng trước" onClick={() => setVisibleMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}><ChevronLeft size={18}/></button><strong>Tháng {visibleMonth.getUTCMonth() + 1} · {visibleMonth.getUTCFullYear()}</strong><button type="button" aria-label="Tháng sau" onClick={() => setVisibleMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}><ChevronRight size={18}/></button></div>
      <div className="date-range-weekdays">{weekDays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="date-range-days" onMouseLeave={() => setHoverDate("")}>{days.map((day) => {
        const value = isoDate(day);
        const endpoint = value === from || value === to;
        const inRange = Boolean(start && end && value > start && value < end);
        const isToday = value === today;
        return <button type="button" key={value} disabled={Boolean(max && value > max)} aria-label={displayDate(value)} aria-pressed={endpoint || inRange} aria-current={isToday ? "date" : undefined}
          className={[day.getUTCMonth() !== visibleMonth.getUTCMonth() ? "outside" : "", endpoint ? "endpoint" : "", inRange ? "in-range" : "", preview && value === hoverDate ? "preview-end" : "", isToday ? "today" : ""].filter(Boolean).join(" ")}
          onMouseEnter={() => { if (!single && from && !to) setHoverDate(value); }} onFocus={() => { if (!single && from && !to) setHoverDate(value); }} onClick={() => selectDay(day)}>{day.getUTCDate()}</button>;
      })}</div>
      <div className="date-range-help"><span className="date-range-step">{single ? <Check size={12}/> : from && !to ? "2" : "1"}</span>{single ? "Chọn ngày để áp dụng ngay" : from && !to ? "Chọn ngày kết thúc để áp dụng" : "Chọn ngày bắt đầu, sau đó ngày kết thúc"}</div>
    </div> : null}
  </div>;
}
