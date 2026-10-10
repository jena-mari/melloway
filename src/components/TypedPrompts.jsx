import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";

export default function TypedPrompts({ prompts, complete = false }) {
  const reduced = useReducedMotion();
  const timeline = useMemo(() => {
    let start = 0,
      letters = 0;
    return prompts.map((prompt) => {
      const item = { ...prompt, start, letters, speed: prompt.speed || 18 };
      start += prompt.text.length * item.speed + 140;
      letters += prompt.text.length;
      return item;
    });
  }, [prompts]);
  const total = prompts.reduce((sum, prompt) => sum + prompt.text.length, 0);
  const [typed, setTyped] = useState(0);
  const finished = complete || reduced || typed >= total;

  useEffect(() => {
    if (complete || reduced) return;
    let frame;
    const started = performance.now();
    setTyped(0);
    function tick(now) {
      const elapsed = now - started;
      const visible = timeline.reduce(
        (sum, prompt) =>
          sum +
          Math.min(
            prompt.text.length,
            Math.max(0, Math.floor((elapsed - prompt.start) / prompt.speed)),
          ),
        0,
      );
      setTyped(visible);
      if (visible < total) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [timeline, total, complete, reduced]);

  return (
    <div className="typed-prompts" data-typing={finished ? "false" : "true"}>
      {timeline.map((prompt) => {
        const Component = prompt.as || "p";
        const count = finished
          ? prompt.text.length
          : Math.min(prompt.text.length, Math.max(0, typed - prompt.letters));
        const active = !finished && count > 0 && count < prompt.text.length;
        return (
          <Component
            key={prompt.id}
            className={`typed-prompt ${prompt.className || ""}`}
          >
            {/* Assistive technology gets each complete prompt once, not every letter. */}
            <span className="sr-only">{prompt.text}</span>
            <span className="typed-reserve" aria-hidden="true">
              {prompt.text}
            </span>
            <span className="typed-ink" aria-hidden="true">
              {prompt.text.slice(0, count)}
              {active && <span className="typing-caret" />}
            </span>
          </Component>
        );
      })}
    </div>
  );
}
