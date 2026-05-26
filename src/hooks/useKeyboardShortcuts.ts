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

/**
 * Returns true when the event target is an input-like element where the
 * user is typing — text input, textarea, contenteditable. Bare-key
 * shortcuts must be suppressed in this case so typing "r" in the chat
 * box doesn't trigger Reset, and "1-5" don't swap role mid-typing.
 *
 * Critical: we check this BEFORE preventDefault. The previous version
 * guarded only inside the callback, which meant preventDefault had
 * already swallowed the keystroke — so the character never made it
 * into the input. Bugs reported: R + numbers not typing in AI chat.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
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
      // Skip bare-key shortcuts when the user is typing in an input.
      // Modifier-key combos (Ctrl+K, Ctrl+/) are intentional global
      // hotkeys and SHOULD fire even from inside inputs — only the
      // unmodified bare keys ("r", "1"-"5") need this guard.
      const hasModifier = combo.ctrl || combo.alt;
      if (!hasModifier && isTypingTarget(e.target)) return;
      e.preventDefault();
      callback();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [combo.key, combo.ctrl, combo.alt, combo.shift, callback]);
}
