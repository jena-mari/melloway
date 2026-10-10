import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
export function Button({ children, className = "", ...props }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      className={`button ${className}`}
      whileTap={reduced ? {} : { scale: 0.97 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
export function Next({ children = "keep going", ...props }) {
  return (
    <Button className="pink" {...props}>
      {children}
      <ArrowRight size={19} />
    </Button>
  );
}
export function Chips({ options, value, onChange, multiple = false }) {
  const reduced = useReducedMotion();
  return (
    <div className="chips">
      {options.map((option) => {
        const selected = multiple ? value.includes(option) : value === option;
        return (
          <motion.button
            key={option}
            type="button"
            className={`chip ${selected ? "selected" : ""}`}
            aria-pressed={selected}
            whileTap={reduced ? {} : { scale: 0.95 }}
            animate={{
              backgroundColor: selected ? "#111111" : "#ffffff",
              color: selected ? "#ffffff" : "#111111",
              borderColor: selected ? "#111111" : "#11111180",
            }}
            transition={{ duration: reduced ? 0 : 0.18 }}
            onClick={() =>
              onChange(
                multiple
                  ? selected
                    ? value.filter((v) => v !== option)
                    : [...value, option]
                  : selected
                    ? ""
                    : option,
              )
            }
          >
            {option}
            <span className="chip-check" aria-hidden="true">
              {selected ? "✓" : ""}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
export function Field({ label, id, ...props }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...props} />
    </label>
  );
}
export function MoodImage({ src, alt = "", className = "" }) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = "none";
        e.currentTarget.parentElement.classList.add("image-fallback");
      }}
    />
  );
}
