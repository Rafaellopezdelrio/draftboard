// ChangelogModal contract:
//   - Auto mode (no forceVersion): shows the entry for __APP_VERSION__ only
//     when lastChangelogVersionShown is non-null and differs; a null value
//     (fresh install) is silently set to the current version instead.
//     Dismissing records the current version.
//   - Force mode: renders the given version's entry regardless of prefs,
//     never writes the pref, and calls onClose on dismiss.
//   - No curated entry or prefs not loaded → nothing.
//
// __APP_VERSION__ is not defined under vitest; it is stubbed per test.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ChangelogModal } from "./ChangelogModal";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";
import { CHANGELOG } from "../data/changelog";

const initialState = usePrefsStore.getState();
const setPref = vi.fn(async () => {});
const LATEST = CHANGELOG[0];

function setPrefs(lastShown: string | null, loaded = true) {
  usePrefsStore.setState({
    prefs: { ...DEFAULT_PREFS, lastChangelogVersionShown: lastShown },
    loaded,
    set: setPref as never,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__APP_VERSION__", LATEST.version);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup(); // unmount before resetting the store so the reset does not re-render outside act
  usePrefsStore.setState(initialState, true);
});

const dialog = () => screen.queryByRole("dialog", { name: "Novedades de Draftboard" });

describe("ChangelogModal — auto mode", () => {
  it("renders nothing and writes nothing before prefs load", () => {
    setPrefs(null, false);
    const { container } = render(<ChangelogModal />);
    expect(container).toBeEmptyDOMElement();
    expect(setPref).not.toHaveBeenCalled();
  });

  it("on a fresh install stays hidden and silently marks the current version seen", () => {
    setPrefs(null);
    render(<ChangelogModal />);
    expect(dialog()).not.toBeInTheDocument();
    expect(setPref).toHaveBeenCalledWith("lastChangelogVersionShown", LATEST.version);
  });

  it("stays hidden when the current version was already shown", () => {
    setPrefs(LATEST.version);
    render(<ChangelogModal />);
    expect(dialog()).not.toBeInTheDocument();
    expect(setPref).not.toHaveBeenCalled();
  });

  it("stays hidden when the running version has no curated entry", () => {
    vi.stubGlobal("__APP_VERSION__", "9.9.9-nonexistent");
    setPrefs("0.0.1");
    render(<ChangelogModal />);
    expect(dialog()).not.toBeInTheDocument();
  });

  it("shows version, date and every highlight after an update", () => {
    setPrefs("0.0.1");
    render(<ChangelogModal />);
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByText(`v${LATEST.version} · ${LATEST.date}`)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(LATEST.highlights);
  });

  it.each([
    ["the 'Entendido' button", () => fireEvent.click(screen.getByRole("button", { name: "Entendido" }))],
    ["the close icon", () => fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))],
    ["a backdrop click", () => fireEvent.click(dialog()!)],
  ])("dismissing via %s records the version and hides the modal", (_label, dismiss) => {
    setPrefs("0.0.1");
    render(<ChangelogModal />);
    dismiss();
    expect(setPref).toHaveBeenCalledWith("lastChangelogVersionShown", LATEST.version);
    expect(dialog()).not.toBeInTheDocument();
  });

  it("clicks inside the card do not dismiss", () => {
    setPrefs("0.0.1");
    render(<ChangelogModal />);
    fireEvent.click(screen.getByRole("heading", { name: "Novedades de Draftboard" }));
    expect(dialog()).toBeInTheDocument();
    expect(setPref).not.toHaveBeenCalled();
  });

  it("falls back to the dev version label when __APP_VERSION__ is undefined", () => {
    vi.unstubAllGlobals();
    setPrefs(null);
    render(<ChangelogModal />);
    expect(setPref).toHaveBeenCalledWith("lastChangelogVersionShown", "0.0.0-dev");
  });
});

describe("ChangelogModal — forced version", () => {
  it("renders even on a fresh install and when already shown, without touching prefs", () => {
    setPrefs(null);
    const { unmount } = render(<ChangelogModal forceVersion={LATEST.version} />);
    expect(dialog()).toBeInTheDocument();
    unmount();

    setPrefs(LATEST.version);
    render(<ChangelogModal forceVersion={LATEST.version} />);
    expect(dialog()).toBeInTheDocument();
    expect(setPref).not.toHaveBeenCalled();
  });

  it("dismiss calls onClose and does not record the version", () => {
    setPrefs("0.0.1");
    const onClose = vi.fn();
    render(<ChangelogModal forceVersion={LATEST.version} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(setPref).not.toHaveBeenCalled();
    expect(dialog()).not.toBeInTheDocument();
  });

  it("renders nothing for a version with no curated entry", () => {
    setPrefs("0.0.1");
    const { container } = render(<ChangelogModal forceVersion="0.0.0-missing" />);
    expect(container).toBeEmptyDOMElement();
  });
});
