import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MetaSourceField } from "./MetaSourceField";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "../../state/prefsStore";

let lastSoloqRun: number | null = null;
vi.mock("../../services/aggregateRepo", () => ({
  getLastAggregationTimestamp: () => Promise.resolve(lastSoloqRun),
}));

function setPrefs(over: Partial<Preferences> = {}) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

const values = () =>
  Array.from(screen.getByRole("combobox").querySelectorAll("option")).map((o) => o.value);

describe("MetaSourceField", () => {
  beforeEach(() => {
    lastSoloqRun = null;
    setPrefs();
  });

  it("hides SoloQ and blend for players without SoloQ data", async () => {
    render(<MetaSourceField />);
    await waitFor(() => expect(values()).toEqual(["dpm", "proplay"]));
  });

  it("offers SoloQ and blend once SoloQ data was synced", async () => {
    lastSoloqRun = Date.now();
    render(<MetaSourceField />);
    await waitFor(() => expect(values()).toEqual(["dpm", "proplay", "soloq", "blend"]));
  });

  it("keeps the option the player already picked", async () => {
    setPrefs({ metaSource: "blend" });
    render(<MetaSourceField />);
    await waitFor(() => expect(values()).toEqual(["dpm", "proplay", "blend"]));
  });
});
