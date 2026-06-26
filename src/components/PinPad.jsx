import React, { useEffect } from "react";
import { Delete } from "lucide-react";

const KEYS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
  ["clear", "0", "back"],
];

/**
 * Numeric PIN pad. Calls `onPin(pin)` when 4 digits are entered.
 * Props:
 *   value       string  — controlled 0-4 digits
 *   onChange    fn(v)   — called with new value on each keystroke
 *   onSubmit    fn(pin) — called when 4 digits are complete (optional; parent can watch value)
 *   disabled    bool
 *   error       string  — shows below dots
 */
export default function PinPad({ value = "", onChange, onSubmit, disabled = false, error = "" }) {
  function press(key) {
    if (disabled) return;
    if (key === "back") {
      onChange(value.slice(0, -1));
    } else if (key === "clear") {
      onChange("");
    } else {
      const next = value.length < 4 ? value + key : value;
      onChange(next);
      if (next.length === 4 && onSubmit) onSubmit(next);
    }
  }

  // Keyboard support
  useEffect(() => {
    function onKey(e) {
      if (disabled) return;
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") press("clear");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // press changes on every render — intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, disabled]);

  return (
    <div className="pinpad-wrapper">
      {/* Dot display */}
      <div className="pinpad-dots" aria-label={`PIN: ${value.length} de 4 dígitos`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`pinpad-dot${value.length > i ? " filled" : ""}`} />
        ))}
      </div>

      {error ? <p className="pinpad-error">{error}</p> : null}

      {/* Keypad */}
      <div className="pinpad-grid">
        {KEYS.map((row, r) =>
          row.map((key) => (
            <button
              key={`${r}-${key}`}
              type="button"
              className={`pinpad-key${key === "clear" || key === "back" ? " pinpad-key-action" : ""}`}
              aria-label={key === "back" ? "Apagar" : key === "clear" ? "Limpar" : key}
              disabled={disabled}
              onClick={() => press(key)}
            >
              {key === "back" ? <Delete size={18} /> : key === "clear" ? "C" : key}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
