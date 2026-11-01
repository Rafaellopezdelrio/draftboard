// TermsGate contract:
//   - Renders nothing until prefs are loaded (no gate flash).
//   - Accepted current TERMS_VERSION → children only.
//   - Never accepted → "new" gate; accepted an older version → "updated" gate.
//   - Accept button stays disabled until the checkbox is ticked; accepting
//     writes timestamp then version.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TermsGate } from "./TermsGate";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "../state/prefsStore";
import { TERMS_VERSION } from "../config";

const initialState = usePrefsStore.getState();
const setPref = vi.fn<(key: string, value: unknown) => Promise<void>>(async () => {});

function setPrefs(over: Partial<Preferences>, loaded = true) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over }, loaded, set: setPref as never });
}

function renderGate() {
  return render(
    <TermsGate>
      <p>contenido-app</p>
    </TermsGate>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setPref.mockReset();
});

afterEach(() => {
  cleanup(); // unmount before resetting the store so the reset does not re-render outside act
  usePrefsStore.setState(initialState, true);
  vi.useRealTimers();
});

describe("TermsGate", () => {
  it("renders nothing while prefs are still loading", () => {
    setPrefs({ termsAcceptedAt: 1, termsAcceptedVersion: TERMS_VERSION }, false);
    const { container } = renderGate();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the children once the current version is accepted", () => {
    setPrefs({ termsAcceptedAt: 1_700_000_000_000, termsAcceptedVersion: TERMS_VERSION });
    renderGate();
    expect(screen.getByText("contenido-app")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows the first-time gate and hides the app when never accepted", () => {
    setPrefs({ termsAcceptedAt: null, termsAcceptedVersion: null });
    renderGate();
    expect(screen.queryByText("contenido-app")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aviso legal y privacidad" })).toBeInTheDocument();
    expect(screen.getByText("Antes de empezar, lee qué datos usamos y de quién.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Riot Games — no endorsado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acepto y empezar" })).toBeDisabled();
  });

  it("re-prompts with the 'updated' copy when an older version was accepted", () => {
    setPrefs({ termsAcceptedAt: 1, termsAcceptedVersion: TERMS_VERSION - 1 });
    renderGate();
    expect(screen.queryByText("contenido-app")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aviso legal actualizado" })).toBeInTheDocument();
    expect(screen.getByText(/Hemos cambiado partes del aviso/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acepto los cambios" })).toBeInTheDocument();
  });

  it("treats a version without timestamp as not accepted (first-time copy)", () => {
    setPrefs({ termsAcceptedAt: null, termsAcceptedVersion: TERMS_VERSION });
    renderGate();
    expect(screen.getByRole("heading", { name: "Aviso legal y privacidad" })).toBeInTheDocument();
  });

  it("enables accept only while the checkbox is ticked and writes timestamp then version", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    setPrefs({ termsAcceptedAt: null, termsAcceptedVersion: null });
    renderGate();
    const accept = screen.getByRole("button", { name: "Acepto y empezar" });
    const box = screen.getByRole("checkbox", { name: /He leído y acepto/ });

    fireEvent.click(accept);
    expect(setPref).not.toHaveBeenCalled();

    fireEvent.click(box);
    expect(accept).toBeEnabled();
    fireEvent.click(box);
    expect(accept).toBeDisabled();

    fireEvent.click(box);
    fireEvent.click(accept);
    expect(setPref.mock.calls).toEqual([
      ["termsAcceptedAt", Date.parse("2026-11-01T10:00:00Z")],
      ["termsAcceptedVersion", TERMS_VERSION],
    ]);
  });

  it("lets the app through once the store records the acceptance", () => {
    setPrefs({ termsAcceptedAt: null, termsAcceptedVersion: null });
    setPref.mockImplementation(async (key, value) => {
      const s = usePrefsStore.getState();
      usePrefsStore.setState({ prefs: { ...s.prefs, [key]: value } });
    });
    renderGate();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Acepto y empezar" }));
    expect(screen.getByText("contenido-app")).toBeInTheDocument();
  });
});
