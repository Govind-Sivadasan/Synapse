import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

interface Props {
  label?: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function parseIsoDate(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function formatDisplay(value: string): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initialViewMonth(from: string, to: string): { year: number; month: number } {
  const anchor = parseIsoDate(from) ?? parseIsoDate(to) ?? new Date();
  return { year: anchor.getFullYear(), month: anchor.getMonth() };
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function buildCalendarDays(year: number, month: number): Array<{ iso: string; day: number; inMonth: boolean }> {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];

  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - firstWeekday + 1;
    if (dayOffset < 1) {
      const day = daysInPrevMonth + dayOffset;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      cells.push({ iso: toIsoDate(prevYear, prevMonth, day), day, inMonth: false });
    } else if (dayOffset > daysInMonth) {
      const day = dayOffset - daysInMonth;
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      cells.push({ iso: toIsoDate(nextYear, nextMonth, day), day, inMonth: false });
    } else {
      cells.push({ iso: toIsoDate(year, month, dayOffset), day: dayOffset, inMonth: true });
    }
  }

  return cells;
}

function isBetween(iso: string, from: string, to: string): boolean {
  if (!from || !to) return false;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  return iso >= start && iso <= end;
}

export default function DateRangeField({
  label = "Date range",
  from,
  to,
  onFromChange,
  onToChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => initialViewMonth(from, to));
  const [awaitingEnd, setAwaitingEnd] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setAwaitingEnd(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!from && !to) {
      setAwaitingEnd(false);
    }
  }, [from, to]);

  const shiftMonth = (delta: number) => {
    setViewMonth((current) => {
      const date = new Date(current.year, current.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  };

  const toggleOpen = () => {
    setOpen((current) => {
      const next = !current;
      if (next) {
        setViewMonth(initialViewMonth(from, to));
        setAwaitingEnd(Boolean(from && !to));
      }
      return next;
    });
  };

  const handleDaySelect = (iso: string) => {
    const picked = parseIsoDate(iso);
    if (picked) {
      setViewMonth({ year: picked.getFullYear(), month: picked.getMonth() });
    }

    if (!from || !awaitingEnd || (from && to)) {
      onFromChange(iso);
      onToChange("");
      setAwaitingEnd(true);
      return;
    }

    if (iso < from) {
      onToChange(from);
      onFromChange(iso);
    } else {
      onToChange(iso);
    }
    setAwaitingEnd(false);
    setOpen(false);
  };

  const clearRange = () => {
    onFromChange("");
    onToChange("");
    setAwaitingEnd(false);
  };

  const days = buildCalendarDays(viewMonth.year, viewMonth.month);
  const todayIso = toIsoDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return (
    <div className="date-range-field" ref={rootRef}>
      {label ? <span className="date-range-field-label">{label}</span> : null}
      <div className="date-range-control-wrap">
        <button
          type="button"
          className={`date-range-control${open ? " date-range-control--open" : ""}`}
          onClick={toggleOpen}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Calendar size={16} className="date-range-control-icon" aria-hidden />
          <span className="date-range-display">
            <span className={from ? undefined : "date-range-placeholder"}>
              {from ? formatDisplay(from) : "Start"}
            </span>
            <span className="date-range-sep" aria-hidden>
              -
            </span>
            <span className={to ? undefined : "date-range-placeholder"}>
              {to ? formatDisplay(to) : "End"}
            </span>
          </span>
        </button>
        {(from || to) && (
          <button
            type="button"
            className="btn-secondary date-range-clear"
            onClick={clearRange}
            aria-label="Clear date range"
          >
            <X size={16} strokeWidth={2.25} aria-hidden />
          </button>
        )}
        {open && (
          <div className="date-range-popover" role="dialog" aria-label="Choose date range">
            <div className="date-range-popover-header">
              <button type="button" className="date-range-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <span className="date-range-popover-title">{monthLabel(viewMonth.year, viewMonth.month)}</span>
              <button type="button" className="date-range-nav" onClick={() => shiftMonth(1)} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="date-range-weekdays">
              {WEEKDAYS.map((day) => (
                <span key={day} className="date-range-weekday">
                  {day}
                </span>
              ))}
            </div>
            <div className="date-range-days">
              {days.map((cell, index) => {
                const isStart = cell.iso === from;
                const isEnd = cell.iso === to;
                const inRange = isBetween(cell.iso, from, to);
                const isToday = cell.iso === todayIso;
                return (
                  <button
                    key={`${cell.iso}-${index}`}
                    type="button"
                    className={[
                      "date-range-day",
                      !cell.inMonth ? "date-range-day--outside" : "",
                      inRange ? "date-range-day--in-range" : "",
                      isStart ? "date-range-day--start" : "",
                      isEnd ? "date-range-day--end" : "",
                      isToday ? "date-range-day--today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleDaySelect(cell.iso)}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
            <p className="date-range-hint">
              {awaitingEnd && from && !to ? "Select end date" : "Select start date, then end date"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
