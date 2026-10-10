import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { sydneyToday, validDate } from "../utils/date";

const calendarDate = (iso) => new Date(`${iso}T12:00:00Z`);
const isoDate = (date) => date.toISOString().slice(0, 10);
const monthOf = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
const readableDay = (date) =>
  date.toLocaleDateString("en-AU", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function DateCalendar({ value, onChange }) {
  const today = sydneyToday();
  const selected = validDate(value) && value >= today ? value : "";
  const [month, setMonth] = useState(() =>
    monthOf(calendarDate(selected || today)),
  );
  const [focused, setFocused] = useState(selected || today);
  const cells = useRef(new Map());
  const moveFocus = useRef(false);
  useEffect(() => {
    if (moveFocus.current) {
      cells.current.get(focused)?.focus({ preventScroll: true });
      moveFocus.current = false;
    }
  }, [focused, month]);
  const monthLabel = month.toLocaleDateString("en-AU", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  const lastDay = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  const offset = (month.getUTCDay() + 6) % 7;
  const rows = Array.from(
    { length: Math.ceil((offset + lastDay) / 7) },
    (_, row) =>
      Array.from({ length: 7 }, (_, col) => {
        const day = row * 7 + col - offset + 1;
        return day > 0 && day <= lastDay
          ? new Date(
              Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day, 12),
            )
          : null;
      }),
  );
  const previousDisabled =
    isoDate(month) <= isoDate(monthOf(calendarDate(today)));
  function changeMonth(delta) {
    const next = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1, 12),
    );
    const end = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0, 12),
    ).getUTCDate();
    next.setUTCDate(Math.min(calendarDate(focused).getUTCDate(), end));
    const day = isoDate(next) < today ? today : isoDate(next);
    setFocused(day);
    setMonth(monthOf(calendarDate(day)));
  }
  function choose(iso) {
    onChange(iso);
    setFocused(iso);
    setMonth(monthOf(calendarDate(iso)));
  }
  function navigateDays(e, iso) {
    const date = calendarDate(iso);
    const weekday = (date.getUTCDay() + 6) % 7;
    const movement = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday,
      End: 6 - weekday,
    }[e.key];
    if (movement === undefined) return;
    e.preventDefault();
    date.setUTCDate(date.getUTCDate() + movement);
    const next = isoDate(date) < today ? today : isoDate(date);
    moveFocus.current = true;
    setFocused(next);
    setMonth(monthOf(calendarDate(next)));
  }
  const tomorrow = calendarDate(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return (
    <div className="date-calendar">
      <div className="calendar-heading">
        <button
          type="button"
          aria-label="previous month"
          disabled={previousDisabled}
          onClick={() => changeMonth(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <p aria-live="polite">{monthLabel}</p>
        <button
          type="button"
          aria-label="next month"
          onClick={() => changeMonth(1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <table aria-label="the day">
        <thead>
          <tr>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <th scope="col" key={day}>
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((date, col) => {
                if (!date) return <td key={`empty-${col}`} />;
                const iso = isoDate(date);
                return (
                  <td key={iso}>
                    <button
                      type="button"
                      ref={(el) =>
                        el
                          ? cells.current.set(iso, el)
                          : cells.current.delete(iso)
                      }
                      aria-label={readableDay(date)}
                      aria-pressed={selected === iso}
                      aria-current={iso === today ? "date" : undefined}
                      disabled={iso < today}
                      tabIndex={focused === iso ? 0 : -1}
                      onFocus={() => setFocused(iso)}
                      onKeyDown={(e) => navigateDays(e, iso)}
                      onClick={() => choose(iso)}
                    >
                      {date.getUTCDate()}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="schedule-shortcuts">
        <button type="button" onClick={() => choose(today)}>
          today
        </button>
        <button type="button" onClick={() => choose(isoDate(tomorrow))}>
          tomorrow
        </button>
        <button
          type="button"
          aria-pressed={!selected}
          onClick={() => onChange("")}
        >
          not sure yet
        </button>
      </div>
      <p className="schedule-selection" role="status">
        {selected
          ? readableDay(calendarDate(selected))
          : "no day picked · we’ll use today"}
      </p>
    </div>
  );
}
