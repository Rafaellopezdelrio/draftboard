// Curated list of pro players to watch. Riot ID format (gameName, tagLine, region).
// region uses platform code (kr, euw1, na1, ...).

export interface ProPlayer {
  name: string;
  team: string;
  role: string;
  riotIdName: string;
  riotIdTag: string;
  region: "kr" | "euw1" | "na1" | "br1" | "la1" | "la2" | "tr1" | "oc1" | "jp1" | "eun1";
  twitch?: string;
}

export const PRO_PLAYERS: ProPlayer[] = [
  // LCK
  { name: "Faker", team: "T1", role: "MID", riotIdName: "Hide on bush", riotIdTag: "KR1", region: "kr", twitch: "faker" },
  { name: "Zeus", team: "T1", role: "TOP", riotIdName: "T1 Zeus", riotIdTag: "KR1", region: "kr" },
  { name: "Oner", team: "T1", role: "JG", riotIdName: "T1 Oner", riotIdTag: "KR1", region: "kr" },
  { name: "Gumayusi", team: "T1", role: "ADC", riotIdName: "T1 Gumayusi", riotIdTag: "KR1", region: "kr" },
  { name: "Keria", team: "T1", role: "SUP", riotIdName: "T1 Keria", riotIdTag: "KR1", region: "kr" },
  { name: "Chovy", team: "GenG", role: "MID", riotIdName: "GEN Chovy", riotIdTag: "KR1", region: "kr" },
  { name: "Kiin", team: "GenG", role: "TOP", riotIdName: "GEN Kiin", riotIdTag: "KR1", region: "kr" },
  { name: "Canyon", team: "GenG", role: "JG", riotIdName: "GEN Canyon", riotIdTag: "KR1", region: "kr" },

  // LEC
  { name: "Caps", team: "G2", role: "MID", riotIdName: "G2 Caps", riotIdTag: "EUW", region: "euw1", twitch: "caps" },
  { name: "Hans Sama", team: "G2", role: "ADC", riotIdName: "G2 Hans Sama", riotIdTag: "EUW", region: "euw1" },
  { name: "BrokenBlade", team: "G2", role: "TOP", riotIdName: "G2 BrokenBlade", riotIdTag: "EUW", region: "euw1" },
  { name: "Yike", team: "G2", role: "JG", riotIdName: "G2 Yike", riotIdTag: "EUW", region: "euw1" },
  { name: "Mikyx", team: "G2", role: "SUP", riotIdName: "G2 Mikyx", riotIdTag: "EUW", region: "euw1" },
  { name: "Rekkles", team: "Karmine Corp", role: "ADC", riotIdName: "KC Rekkles", riotIdTag: "EUW", region: "euw1", twitch: "rekkles" },
  { name: "Hylissang", team: "Fnatic", role: "SUP", riotIdName: "FNC Hylissang", riotIdTag: "EUW", region: "euw1" },

  // LCS
  { name: "Bjergsen", team: "TSM", role: "MID", riotIdName: "Bjergsen", riotIdTag: "NA1", region: "na1", twitch: "bjergsen" },
  { name: "Doublelift", team: "Retired", role: "ADC", riotIdName: "Doublelift", riotIdTag: "NA1", region: "na1", twitch: "doublelift" },
];
