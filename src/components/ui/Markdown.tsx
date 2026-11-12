// Tiny markdown renderer for AI coach output. Supports `#` headings, `**bold**`,
// `_italic_` / `*italic*`, `- ` / `* ` bullets, `1. ` numbered lists and blank-
// line paragraphs. Unpaired `**` / `__` left by the model are dropped instead of
// shown raw. Why not react-markdown: ~50kB gzipped for this small surface.

import type { ReactElement, ReactNode } from "react";

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const blocks: ReactElement[] = [];
  const lines = source.split(/\r?\n/);
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let idx = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push(
      <p key={`p-${idx++}`} className="leading-relaxed">
        {renderInline(para.join(" "))}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{renderInline(it)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={`ol-${idx++}`} className="list-decimal pl-5 space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${idx++}`} className="list-disc pl-5 space-y-1">
          {items}
        </ul>
      )
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flushPara();
      flushList();
      const cls =
        h[1].length <= 2
          ? "text-[11px] uppercase tracking-widest text-accent font-semibold mt-2"
          : "text-[10px] uppercase tracking-wide text-white/70 font-semibold mt-1";
      blocks.push(
        <p key={`h-${idx++}`} className={cls}>
          {renderInline(h[2])}
        </p>
      );
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = bullet ? null : line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return <div className={`space-y-2 break-words [overflow-wrap:anywhere] ${className}`}>{blocks}</div>;
}

/** Inline markdown: **bold**, _italic_, *italic*. Bold first (longer delimiter). */
export function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*)|(\b_[^_\n]+_\b)|(\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  const plain = (s: string) => s.replace(/\*\*|__/g, "");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(plain(text.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={`b-${i++}`} className="text-white font-semibold">
          {tok.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <em key={`i-${i++}`} className="text-accent/90 not-italic font-medium">
          {tok.slice(1, -1)}
        </em>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(plain(text.slice(last)));
  return parts;
}
