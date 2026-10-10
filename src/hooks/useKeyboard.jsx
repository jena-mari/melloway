import { useEffect, useState } from "react";

export default function useKeyboard() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let fullHeight = window.innerHeight;
    function update() {
      const editing = document.activeElement?.matches(
        'input:not([type="range"]), textarea, select',
      );
      if (!editing) fullHeight = window.innerHeight;
      setOpen(Boolean(editing && fullHeight - viewport.height > 150));
    }
    viewport.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return open;
}
