import { useEffect } from "react";

export function useEscape(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape, enabled]);
}

export function useGlobalShortcut(
  combo: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean },
  callback: () => void
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== combo.key.toLowerCase()) return;
      if (!!combo.ctrl !== (e.ctrlKey || e.metaKey)) return;
      if (!!combo.alt !== e.altKey) return;
      if (!!combo.shift !== e.shiftKey) return;
      e.preventDefault();
      callback();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [combo.key, combo.ctrl, combo.alt, combo.shift, callback]);
}
