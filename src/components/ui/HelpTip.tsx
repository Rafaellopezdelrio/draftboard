// Small "?" affordance for inline help in settings + forms.
//
// Renders a tiny circled question-mark glyph that shows the hint on
// hover (native title attribute — works keyboard-accessible via
// browser focus indicator without us building a popover).
//
// Why not InfoTooltip: that one is GLOSSARY-keyed (term → definition).
// HelpTip is per-call — the caller supplies the hint text directly,
// useful for setting-specific guidance that doesn't belong in the
// shared glossary.
//
// Future enhancement: swap title for a real positioned popover with
// rich content (links, code snippets). For now native title is enough
// and zero JS cost.

import { HelpCircle } from "lucide-react";

interface Props {
  /** Hint shown on hover / focus. Plain text. Keep short — title
   * attributes don't support markup or rich layout. */
  hint: string;
  /** Optional override aria-label. Defaults to the hint itself so
   * screen readers announce the help text on focus. */
  ariaLabel?: string;
}

export function HelpTip({ hint, ariaLabel }: Props) {
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? hint}
      title={hint}
      tabIndex={0}
      className="inline-flex items-center text-white/40 hover:text-white/70 focus:text-white focus:outline-none focus:ring-1 focus:ring-accent/50 rounded cursor-help ml-1 align-middle"
    >
      <HelpCircle className="w-3 h-3" aria-hidden="true" />
    </span>
  );
}
