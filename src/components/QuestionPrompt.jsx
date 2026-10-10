import { useMemo, useState } from "react";
import TypedPrompts from "./TypedPrompts";

// One short scripted prompt, in the same composition as the original intro.
export default function QuestionPrompt({ title, copy, children }) {
  const [complete, setComplete] = useState(false);
  const prompts = useMemo(
    () => [
      { id: "question", as: "h1", text: title, speed: 22 },
      ...(copy
        ? [{ id: "context", className: "question-copy", text: copy, speed: 16 }]
        : []),
    ],
    [title, copy],
  );
  return (
    <div
      onFocusCapture={() => setComplete(true)}
      onPointerDownCapture={() => setComplete(true)}
    >
      <TypedPrompts prompts={prompts} complete={complete} />
      {children}
    </div>
  );
}
