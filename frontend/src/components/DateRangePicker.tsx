import { todayInputValue, dateOnly, parseCalendarDate, calendarDateValue } from "../utils/time";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function isoDate(date: Date) { return calendarDateValue(date); }

function parseDate(value: string) { return parseCalendarDate(value); }

function displayDate(value: string) {
  return value ? dateOnly(value) : "";
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initial = from || to;
    const date = parseDate(initial || todayInputValue());
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
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
    const first = new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth(), 1));
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    const calendarStart = new Date(first);
    calendarStart.setUTCDate(first.getUTCDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(calendarStart);
      day.setUTCDate(calendarStart.getUTCDate() + index);
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
    const today = todayInputValue();
    onChange(today, today);
    setVisibleMonth(parseDate(today));
    setOpen(false);
  }

  function chooseCurrentMonth() {
    const today = parseDate(todayInputValue());
    onChange(isoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), isoDate(today));
    setVisibleMonth(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
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
            <button type="button" onClick={() => setVisibleMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))} aria-label="Tháng trước"><ChevronLeft size={18} /></button>
            <strong>Tháng {visibleMonth.getUTCMonth() + 1}/{visibleMonth.getUTCFullYear()}</strong>
            <button type="button" onClick={() => setVisibleMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))} aria-label="Tháng sau"><ChevronRight size={18} /></button>
          </div>
          <div className="date-range-weekdays">
            {weekDays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="date-range-days">
            {days.map((day) => {
              const value = isoDate(day);
              const outside = day.getUTCMonth() !== visibleMonth.getUTCMonth();
              const endpoint = value === from || value === to;
              const inRange = Boolean(from && to && value > from && value < to);
              const today = value === todayInputValue();
              return (
                <button
                  className={`${outside ? "outside " : ""}${inRange ? "in-range " : ""}${endpoint ? "endpoint " : ""}${today ? "today" : ""}`.trim()}
                  key={value}
                  type="button"
                  onClick={() => selectDay(day)}
                  aria-pressed={endpoint}
                >
                  {day.getUTCDate()}
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
