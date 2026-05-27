// Window-level event channel for opening the per-champion guide modal.
// DraftBoard fires `draft:show-champion-guide` from its right-click
// menu — we listen here and surface the champion key so App.tsx can
// render <ChampionGuideView championKey={...} />.
//
// Custom-event channel keeps DraftBoard free of prop-drilling — the
// modal lives 10 components up, and a callback prop would have to
// thread through every board cell.

import { useEffect, useState } from "react";

interface UseChampionGuideEvent {
  guideChampionKey: string | null;
  setGuideChampionKey: (key: string | null) => void;
}

export function useChampionGuideEvent(): UseChampionGuideEvent {
  const [guideChampionKey, setGuideChampionKey] = useState<string | null>(null);
  useEffect(() => {
    const onShowGuide = (e: Event) => {
      const ce = e as CustomEvent<{ championKey: string }>;
      if (ce.detail?.championKey) {
        setGuideChampionKey(ce.detail.championKey);
      }
    };
    window.addEventListener("draft:show-champion-guide", onShowGuide);
    return () =>
      window.removeEventListener("draft:show-champion-guide", onShowGuide);
  }, []);
  return { guideChampionKey, setGuideChampionKey };
}
