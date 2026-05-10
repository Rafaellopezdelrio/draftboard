// Riot queue ids -> human readable names.
// Source: https://static.developer.riotgames.com/docs/lol/queues.json
export const QUEUE_NAMES: Record<number, string> = {
  400: "Normal Draft",
  420: "SoloQ",
  430: "Normal Blind",
  440: "Flex",
  450: "ARAM",
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
};

export function queueLabel(queueId: number): string {
  return QUEUE_NAMES[queueId] ?? `Queue ${queueId}`;
}
