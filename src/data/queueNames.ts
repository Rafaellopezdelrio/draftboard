// Riot queue ids -> human readable names.
// Source: https://static.developer.riotgames.com/docs/lol/queues.json
export const QUEUE_NAMES: Record<number, string> = {
  0: "Custom",
  400: "Normal Draft",
  420: "SoloQ",
  430: "Normal Blind",
  440: "Flex",
  450: "ARAM",
  720: "ARAM Clash",
  490: "Normal Quickplay",
  700: "Clash",
  830: "Co-op vs AI Intro",
  840: "Co-op vs AI Beginner",
  850: "Co-op vs AI Intermediate",
  900: "URF",
  1020: "One for All",
  1300: "Nexus Blitz",
  1400: "Ultimate Spellbook",
  1700: "Arena",
  1900: "URF",
  2000: "Tutorial 1",
  2010: "Tutorial 2",
  2020: "Tutorial 3",
  2300: "Brawl",
  2400: "Brawl",
  3140: "Custom/Bot",
  6000: "ARAM Chaos",
};

// Queues we consider "real PvP ranked-relevant matches" — used to filter noise
// (custom games, tutorials, very old modes).
export const RELEVANT_QUEUE_IDS = new Set<number>([
  400, 420, 430, 440, 450, 490, 700, 720, 900, 1020, 1300, 1400, 1700, 1900, 6000,
]);

export function isRelevantQueue(queueId: number): boolean {
  return RELEVANT_QUEUE_IDS.has(queueId);
}

export function queueLabel(queueId: number): string {
  return QUEUE_NAMES[queueId] ?? `Queue ${queueId}`;
}
