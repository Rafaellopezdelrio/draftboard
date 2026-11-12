/**
 * Clean a Riot ID as people type it: "Name#TAG" pasted whole into the name
 * box, a "#" in front of the tag, stray spaces around either part.
 */
export function splitRiotId(name: string, tag: string): { gameName: string; tagLine: string } {
  const n = (name ?? "").trim();
  const hash = n.indexOf("#");
  const gameName = (hash >= 0 ? n.slice(0, hash) : n).trim();
  const fromName = hash >= 0 ? n.slice(hash + 1).trim() : "";
  const tagLine = (fromName || (tag ?? "")).trim().replace(/^#+/, "").trim();
  return { gameName, tagLine };
}
