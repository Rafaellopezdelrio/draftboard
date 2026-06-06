import { useTranslation } from "react-i18next";

interface Props {
  term: string;
  children?: React.ReactNode;
}

// Terms that have a glossary.* translation key. Anything not listed renders
// without a tooltip (same as before, when GLOSSARY had no entry).
const GLOSSARY_TERMS = new Set([
  "GPI", "KDA", "CS", "CSPM", "KP", "WR", "LP", "Vision",
  "Counter", "Synergy", "Tier", "Mastery", "Hotstreak",
]);

export function InfoTooltip({ term, children }: Props) {
  const { t } = useTranslation();
  if (!GLOSSARY_TERMS.has(term)) return <>{children ?? term}</>;
  const detail = t(`glossary.${term}`);
  return (
    <span
      className="border-b border-dotted border-white/30 cursor-help"
      title={detail}
    >
      {children ?? term}
    </span>
  );
}
