// Lock down the changelog structure. A typo in `version` or a missing
// `date` would silently break the auto-show modal — the lookup returns
// null, no "What's new" appears, user never knows.

import { describe, it, expect } from "vitest";
import { CHANGELOG, getChangelogFor } from "./changelog";

describe("CHANGELOG", () => {
  it("has at least one entry", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it("every entry has a non-empty version, date, and highlights", () => {
    for (const e of CHANGELOG) {
      expect(e.version, "version").toMatch(/^\d+\.\d+\.\d+(-.+)?$/);
      expect(e.date, `date for v${e.version}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.highlights.length, `highlights for v${e.version}`).toBeGreaterThan(0);
      for (const h of e.highlights) {
        expect(h.length, `highlight in v${e.version}`).toBeGreaterThan(5);
      }
    }
  });

  it("versions are unique (no duplicate entries)", () => {
    const versions = CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("entries are ordered newest first by date", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(
        CHANGELOG[i - 1].date >= CHANGELOG[i].date,
        `${CHANGELOG[i - 1].version} should be newer than ${CHANGELOG[i].version}`
      ).toBe(true);
    }
  });
});

describe("getChangelogFor", () => {
  it("returns the entry for an existing version", () => {
    const v = CHANGELOG[0].version;
    const e = getChangelogFor(v);
    expect(e).not.toBeNull();
    expect(e!.version).toBe(v);
  });

  it("returns null for a version with no curated entry", () => {
    expect(getChangelogFor("99.99.99")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getChangelogFor("")).toBeNull();
  });
});
