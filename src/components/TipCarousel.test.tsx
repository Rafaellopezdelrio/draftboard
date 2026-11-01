// TipCarousel contract:
//   - Tips = AI tips (debounced 600ms, cache-first) + curated champion tips
//     + per-role tips; nothing to show → renders nothing.
//   - Rotates every 6s with an "n/total" counter; resets on champion change.
//   - AI request uses the active provider's key and the coach language.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TipCarousel } from "./TipCarousel";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "../state/prefsStore";
import type { Champion } from "../types/champion";
import es from "../i18n/locales/es.json";

vi.mock("../services/championTips", () => ({ getChampionTips: vi.fn() }));
import { getChampionTips } from "../services/championTips";
const getTips = vi.mocked(getChampionTips);

const roleTips = es.tipCarousel.roleTips;
const leeTips = es.tipCarousel.champTips.LeeSin;

function champ(over: Partial<Champion> = {}): Champion {
  return {
    id: "LeeSin",
    key: "64",
    name: "Lee Sin",
    title: "",
    iconUrl: "",
    splashUrl: "",
    tags: [],
    roles: [],
    archetypes: [],
    ...over,
  };
}

function setPrefs(over: Partial<Preferences> = {}) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

beforeEach(() => {
  vi.useFakeTimers();
  getTips.mockReset().mockResolvedValue([]);
  setPrefs({ groqApiKey: "groq-k", geminiApiKey: "gem-k", anthropicApiKey: "ant-k" });
});

afterEach(() => {
  vi.useRealTimers();
});

async function flushDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
}

describe("TipCarousel", () => {
  it("renders nothing with neither champion nor role", async () => {
    const { container } = render(<TipCarousel champion={null} role={null} patch="16.11" />);
    await flushDebounce();
    expect(container).toBeEmptyDOMElement();
    expect(getTips).not.toHaveBeenCalled();
  });

  it("renders nothing for an uncurated champion without a role (no AI call either)", async () => {
    const { container } = render(
      <TipCarousel champion={champ({ name: "Aatrox", key: "266" })} role={null} patch="16.11" />
    );
    await flushDebounce();
    expect(container).toBeEmptyDOMElement();
    expect(getTips).not.toHaveBeenCalled();
  });

  it("shows role tips with the role as label and rotates every 6s, wrapping around", async () => {
    render(<TipCarousel champion={null} role="TOP" patch="16.11" />);
    expect(screen.getByText("Tip · TOP")).toBeInTheDocument();
    expect(screen.getByText(roleTips.TOP[0])).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.getByText(roleTips.TOP[1])).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(screen.getByText(roleTips.TOP[0])).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    // No champion+role → no AI request.
    expect(getTips).not.toHaveBeenCalled();
  });

  it("puts curated champion tips before role tips", () => {
    render(<TipCarousel champion={champ()} role="JUNGLE" patch="16.11" />);
    expect(screen.getByText("Tip · Lee Sin")).toBeInTheDocument();
    expect(screen.getByText(leeTips[0])).toBeInTheDocument();
    expect(screen.getByText(`1/${leeTips.length + roleTips.JUNGLE.length}`)).toBeInTheDocument();
  });

  it("requests AI tips after the debounce with the groq key and prepends them", async () => {
    getTips.mockResolvedValue(["AI uno", "AI dos"]);
    render(<TipCarousel champion={champ()} role="JUNGLE" patch="16.11" />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(getTips).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getTips).toHaveBeenCalledWith({
      provider: "groq",
      apiKey: "groq-k",
      championId: 64,
      championName: "Lee Sin",
      role: "JUNGLE",
      patch: "16.11",
      language: "es",
    });
    expect(screen.getByText("AI uno")).toBeInTheDocument();
    expect(screen.getByText(`1/${2 + leeTips.length + roleTips.JUNGLE.length}`)).toBeInTheDocument();
  });

  it("uses the gemini key and English when configured", async () => {
    setPrefs({ aiProvider: "gemini", geminiApiKey: "gem-k", aiCoachLanguage: "en" });
    render(<TipCarousel champion={champ()} role="JUNGLE" patch="16.11" />);
    await flushDebounce();
    expect(getTips).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "gemini", apiKey: "gem-k", language: "en" })
    );
  });

  it("uses the anthropic key for the anthropic provider", async () => {
    setPrefs({ aiProvider: "anthropic", anthropicApiKey: "ant-k" });
    render(<TipCarousel champion={champ()} role="JUNGLE" patch="16.11" />);
    await flushDebounce();
    expect(getTips).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic", apiKey: "ant-k" })
    );
  });

  it("does not fire the AI request when unmounted before the debounce", async () => {
    const { unmount } = render(<TipCarousel champion={champ()} role="JUNGLE" patch="16.11" />);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(getTips).not.toHaveBeenCalled();
  });

  it("ignores a stale AI response after the champion changes", async () => {
    let resolveFirst!: (v: string[]) => void;
    getTips.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    const { rerender } = render(<TipCarousel champion={champ()} role="JUNGLE" patch="16.11" />);
    await flushDebounce();
    expect(getTips).toHaveBeenCalledTimes(1);

    rerender(
      <TipCarousel champion={champ({ name: "Aatrox", key: "266" })} role="JUNGLE" patch="16.11" />
    );
    await act(async () => {
      resolveFirst(["Tip viejo de Lee"]);
    });
    expect(screen.queryByText("Tip viejo de Lee")).not.toBeInTheDocument();
    expect(screen.getByText("Tip · Aatrox")).toBeInTheDocument();
  });

  it("resets to the first tip when the champion changes", async () => {
    const { rerender } = render(<TipCarousel champion={champ()} role="JUNGLE" patch="16.11" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.getByText(leeTips[1])).toBeInTheDocument();

    rerender(
      <TipCarousel champion={champ({ id: "Jinx", name: "Jinx", key: "222" })} role="JUNGLE" patch="16.11" />
    );
    expect(screen.getByText(es.tipCarousel.champTips.Jinx[0])).toBeInTheDocument();
    expect(screen.getByText("1/6")).toBeInTheDocument();
  });
});
