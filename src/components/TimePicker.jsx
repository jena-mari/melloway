import { Sun, Sunset, Moon } from "lucide-react";
import { validTime } from "../utils/date";

const presets = [
  { label: "morning", display: "11 am", value: "11:00", Icon: Sun },
  { label: "afternoon", display: "2 pm", value: "14:00", Icon: Sunset },
  { label: "evening", display: "6 pm", value: "18:00", Icon: Moon },
];
export default function TimePicker({ value, onChange }) {
  const selected = validTime(value);
  const [hours, minutes] = (selected ? value : "11:00").split(":").map(Number);
  const hour = hours % 12 || 12;
  const period = hours >= 12 ? "pm" : "am";
  function change(part, next) {
    const h = part === "hour" ? Number(next) : hour;
    const m = part === "minute" ? Number(next) : minutes;
    const p = part === "period" ? next : period;
    onChange(
      `${String((h % 12) + (p === "pm" ? 12 : 0)).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    );
  }
  return (
    <div className="outing-time-picker">
      <div className="time-presets" aria-label="quick start times">
        {presets.map(({ label, display, value: time, Icon }) => (
          <button
            type="button"
            key={time}
            aria-pressed={value === time}
            onClick={() => onChange(time)}
          >
            <Icon size={19} />
            <span>{label}</span>
            <strong>{display}</strong>
          </button>
        ))}
      </div>
      <fieldset className="time-controls">
        <legend>or pick ur own</legend>
        <div>
          <label htmlFor="outing-hour">
            <span id="outing-hour-label">hour</span>
            <select
              id="outing-hour"
              aria-labelledby="outing-hour-label"
              value={selected ? hour : ""}
              onChange={(e) => change("hour", e.target.value)}
            >
              <option value="" disabled>
                hh
              </option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="time-colon" aria-hidden="true">
            :
          </span>
          <label htmlFor="outing-minute">
            <span id="outing-minute-label">minute</span>
            <select
              id="outing-minute"
              aria-labelledby="outing-minute-label"
              value={selected ? minutes : ""}
              onChange={(e) => change("minute", e.target.value)}
            >
              <option value="" disabled>
                mm
              </option>
              {Array.from({ length: 60 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>
                  {String(n).padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="outing-period">
            <span id="outing-period-label">am or pm</span>
            <select
              id="outing-period"
              aria-labelledby="outing-period-label"
              value={selected ? period : ""}
              onChange={(e) => change("period", e.target.value)}
            >
              <option value="" disabled>
                —
              </option>
              <option value="am">am</option>
              <option value="pm">pm</option>
            </select>
          </label>
        </div>
      </fieldset>
      <div className="schedule-shortcuts time-clear">
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
          ? `starting around ${hour}:${String(minutes).padStart(2, "0")} ${period}`
          : "no time picked · we’ll use 11 am"}
      </p>
    </div>
  );
}
