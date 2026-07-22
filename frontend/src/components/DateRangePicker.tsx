import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function displayDate(value: string) {
  return value ? new Intl.DateTimeFormat("vi-VN").format(parseDate(value)) : "";
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initial = from || to;
    const date = initial ? parseDate(initial) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const calendarStart = new Date(first);
    calendarStart.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(calendarStart);
      day.setDate(calendarStart.getDate() + index);
      return day;
    });
  }, [visibleMonth]);

  const label = from && to
    ? `${displayDate(from)} – ${displayDate(to)}`
    : from
      ? `${displayDate(from)} – Chọn ngày kết thúc`
      : to
        ? `Đến ${displayDate(to)}`
        : "Chọn khoảng thời gian";

  function selectDay(day: Date) {
    const selected = isoDate(day);
    if (!from || to) {
      onChange(selected, "");
      return;
    }
    if (selected < from) onChange(selected, from);
    else onChange(from, selected);
    setOpen(false);
  }

  function chooseToday() {
    const today = isoDate(new Date());
    onChange(today, today);
    setVisibleMonth(new Date());
    setOpen(false);
  }

  function chooseCurrentMonth() {
    const today = new Date();
    onChange(isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), isoDate(today));
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setOpen(false);
  }

  return (
    <div className="date-range-picker" ref={wrapperRef}>
      <button className={`date-range-trigger${open ? " open" : ""}`} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <CalendarDays size={17} />
        <span>{label}</span>
        {(from || to) ? <span className="date-range-clear" role="button" tabIndex={0} aria-label="Xóa khoảng thời gian" onClick={(event) => { event.stopPropagation(); onChange("", ""); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onChange("", ""); } }}><X size={15} /></span> : null}
      </button>

      {open ? (
        <div className="date-range-popover" role="dialog" aria-label="Chọn khoảng thời gian">
          <div className="date-range-calendar-header">
            <button type="button" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Tháng trước"><ChevronLeft size={18} /></button>
            <strong>Tháng {visibleMonth.getMonth() + 1}/{visibleMonth.getFullYear()}</strong>
            <button type="button" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Tháng sau"><ChevronRight size={18} /></button>
          </div>
          <div className="date-range-weekdays">
            {weekDays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="date-range-days">
            {days.map((day) => {
              const value = isoDate(day);
              const outside = day.getMonth() !== visibleMonth.getMonth();
              const endpoint = value === from || value === to;
              const inRange = Boolean(from && to && value > from && value < to);
              const today = value === isoDate(new Date());
              return (
                <button
                  className={`${outside ? "outside " : ""}${inRange ? "in-range " : ""}${endpoint ? "endpoint " : ""}${today ? "today" : ""}`.trim()}
                  key={value}
                  type="button"
                  onClick={() => selectDay(day)}
                  aria-pressed={endpoint}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="date-range-help">{from && !to ? "Chọn ngày kết thúc" : "Chọn ngày bắt đầu, sau đó chọn ngày kết thúc"}</div>
          <div className="date-range-presets">
            <button type="button" onClick={chooseToday}>Hôm nay</button>
            <button type="button" onClick={chooseCurrentMonth}>Tháng này</button>
            <button type="button" onClick={() => { onChange("", ""); setOpen(false); }}>Xóa khoảng</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
