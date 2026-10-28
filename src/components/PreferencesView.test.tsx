// PreferencesView contract:
//   - Renders one switch per SECTIONS item, checked state mirrors the store;
//     flipping a switch writes the pref.
//   - Search filters items by resolved label/detail text, hides empty
//     sections + the presets row + the custom fields, and shows a
//     "no results" line when nothing matches; the X button clears it.
//   - Presets force only their declared keys; "disable all" turns off the
//     four LCU auto-actions and nothing else.
//   - "Restablecer todo" goes through a ConfirmDialog; confirm resets to
//     DEFAULT_PREFS, cancel leaves prefs alone.
//   - Done button, backdrop click and Escape close the modal.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PreferencesView } from "./PreferencesView";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "../state/prefsStore";
import { SECTIONS } from "./prefs/prefsConfig";

const TOGGLE_COUNT = SECTIONS.reduce((n, s) => n + s.items.length, 0);

vi.mock("../services/autostart", () => ({
  isAutostartEnabled: vi.fn().mockResolvedValue(false),
  enableAutostart: vi.fn().mockResolvedValue(undefined),
  disableAutostart: vi.fn().mockResolvedValue(undefined),
}));

function setPrefs(over: Partial<Preferences> = {}) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

function prefs(): Preferences {
  return usePrefsStore.getState().prefs;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Toggle switch whose accessible name starts with the given label. */
function sw(label: string): HTMLInputElement {
  return screen.getByRole("switch", { name: new RegExp(`^${escapeRe(label)}`) }) as HTMLInputElement;
}

function switchNames(): string[] {
  return screen.getAllByRole("switch").map((el) => {
    const label = el.closest("label")!;
    return label.querySelector("p")!.firstChild!.textContent!.trim();
  });
}

async function renderView(onClose = vi.fn()) {
  const utils = render(<PreferencesView onClose={onClose} />);
  // AutostartField resolves isAutostartEnabled() on mount.
  await act(async () => {});
  return { ...utils, onClose };
}

beforeEach(() => {
  setPrefs();
});

describe("PreferencesView — toggles", () => {
  it("renders every section and mirrors the store's boolean prefs", async () => {
    setPrefs({ compactMode: true, showSuggestions: false });
    await renderView();
    expect(screen.getByRole("heading", { name: "Paneles del draft" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI Coach" })).toBeInTheDocument();
    // One switch per SECTIONS item.
    expect(screen.getAllByRole("switch")).toHaveLength(TOGGLE_COUNT);
    expect(sw("Modo compacto")).toBeChecked();
    expect(sw("Top picks sugeridos")).not.toBeChecked();
    expect(sw("Probabilidad de ganar el draft")).toBeChecked();
  });

  it("marks danger items as advanced and wires the detail as description", async () => {
    await renderView();
    const runes = sw("Aplicar runas al confirmar campeón");
    expect(runes.closest("label")).toHaveTextContent("avanzado");
    expect(runes).toHaveAccessibleDescription(
      "Aplica automáticamente las runas recomendadas al cerrar tu pick"
    );
    expect(sw("Modo compacto").closest("label")).not.toHaveTextContent("avanzado");
  });

  it("flipping a switch writes the pref", async () => {
    await renderView();
    fireEvent.click(sw("Modo compacto"));
    await waitFor(() => expect(prefs().compactMode).toBe(true));
    expect(sw("Modo compacto")).toBeChecked();
  });
});

describe("PreferencesView — search", () => {
  it("filters items by resolved label text and hides presets + custom fields", async () => {
    await renderView();
    expect(screen.getByText("Presets · 1 click")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument(); // AutostartField

    fireEvent.change(screen.getByPlaceholderText(/Buscar preferencia/), {
      target: { value: "  RUNAS " },
    });

    expect(switchNames()).toEqual([
      "Panel de build (items, runas, skills)",
      "Mostrar botón 'Aplicar runas al cliente'",
      "Aplicar runas al confirmar campeón (lock-in)",
      "Aplicar runas al hover (intent)",
    ]);
    expect(screen.getByRole("heading", { name: "Paneles del draft" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Acciones automáticas (LCU)" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Interfaz" })).toBeNull();
    expect(screen.queryByText("Presets · 1 click")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("matches on detail text too", async () => {
    await renderView();
    fireEvent.change(screen.getByPlaceholderText(/Buscar preferencia/), {
      target: { value: "gdpr" },
    });
    expect(switchNames()).toEqual(["Enviar reportes de error anónimos (Sentry)"]);
    expect(screen.getByRole("heading", { name: "Privacidad" })).toBeInTheDocument();
  });

  it("shows the no-results line and the clear button restores everything", async () => {
    await renderView();
    const input = screen.getByPlaceholderText(/Buscar preferencia/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.getByText('Sin resultados para "zzzz".')).toBeInTheDocument();

    // Clearing remounts AutostartField, which re-reads autostart state async.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    });
    expect(input.value).toBe("");
    expect(screen.getAllByRole("switch")).toHaveLength(TOGGLE_COUNT);
    expect(screen.queryByRole("button", { name: "Limpiar búsqueda" })).toBeNull();
  });
});

describe("PreferencesView — presets", () => {
  it("competitive preset forces its keys and leaves undeclared prefs untouched", async () => {
    setPrefs({ compactMode: true, autoApplyOnHover: false, coachAfterMatch: true });
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: /^Competitivo/ }));
    await waitFor(() => expect(prefs().coachShowGpi).toBe(false));
    expect(prefs()).toMatchObject({
      showDraftWinrate: false,
      showCompAnalysis: false,
      autoApplyOnHover: true,
      coachAfterMatch: false,
      // not part of the preset
      compactMode: true,
      telemetryEnabled: true,
    });
  });

  it("silent preset turns on safe mode and every auto-action off", async () => {
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: /^Silencioso/ }));
    await waitFor(() => expect(prefs().safeMode).toBe(true));
    expect(prefs()).toMatchObject({
      autoApplyRunes: false,
      autoApplySpells: false,
      autoApplyItemSet: false,
      voiceCoachEnabled: false,
    });
  });

  it("disable-all turns off only the four LCU auto-actions", async () => {
    setPrefs({ autoApplyRunes: true, autoApplyOnHover: true, autoApplySpells: true, autoApplyItemSet: true });
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: /Desactivar TODAS las auto-acciones LCU/ }));
    await waitFor(() => expect(prefs().autoApplyItemSet).toBe(false));
    expect(prefs()).toMatchObject({
      autoApplyRunes: false,
      autoApplyOnHover: false,
      autoApplySpells: false,
      showRuneImportButton: true,
      showSpellImportButton: true,
    });
  });
});

describe("PreferencesView — reset + close", () => {
  it("reset asks for confirmation; cancel keeps prefs", async () => {
    setPrefs({ compactMode: true });
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: "Restablecer todo" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("¿Restablecer todas las preferencias?");
    // Two "Cancelar" buttons (X icon + text button) — take the text one.
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[1]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(prefs().compactMode).toBe(true);
  });

  it("confirming reset restores DEFAULT_PREFS", async () => {
    setPrefs({ compactMode: true, safeMode: true });
    await renderView();
    fireEvent.click(screen.getByRole("button", { name: "Restablecer todo" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(prefs()).toEqual(DEFAULT_PREFS);
    expect(sw("Modo compacto")).not.toBeChecked();
  });

  it("Done button and backdrop click close; clicks inside the panel don't", async () => {
    const { onClose } = await renderView();
    fireEvent.click(screen.getByRole("heading", { name: "Preferencias" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Hecho" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("Escape closes the modal", async () => {
    const { onClose } = await renderView();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
