// CommandPalette contract:
//   - Empty query: recent commands (from localStorage, most recent first)
//     under a "Recientes" header, then the rest grouped by `group`.
//   - Typing filters by case-insensitive substring into a flat list.
//   - ArrowUp/ArrowDown move the highlight (clamped), Enter / click runs the
//     command, records it as recent and closes.
//   - Escape and backdrop click close. localStorage failures are silent.
//
// jsdom here has no localStorage and no scrollIntoView: both are stubbed.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CommandPalette, type Command } from "./CommandPalette";

const RECENT_KEY = "draftboard:cmd-palette:recent";

let store: Map<string, string>;
const storage = {
  getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
  setItem: vi.fn((k: string, v: string) => {
    store.set(k, v);
  }),
  removeItem: vi.fn((k: string) => {
    store.delete(k);
  }),
  clear: vi.fn(() => store.clear()),
};

const scrollIntoView = vi.fn();

beforeEach(() => {
  store = new Map();
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", storage);
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mkCmds(): Command[] {
  return [
    { id: "prefs", label: "Abrir Preferencias", shortcut: "Ctrl+,", action: vi.fn() },
    { id: "history", label: "Ver historial", action: vi.fn() },
    { id: "tier", label: "Tier list", action: vi.fn() },
  ];
}

function setup(commands: Command[] = mkCmds()) {
  const onClose = vi.fn();
  const utils = render(<CommandPalette commands={commands} onClose={onClose} />);
  const input = screen.getByRole("textbox", { name: "Buscar acción" });
  return { onClose, commands, input, ...utils };
}

const optionLabels = () => screen.getAllByRole("option").map((o) => o.textContent);
const selected = () =>
  screen.getAllByRole("option").find((o) => o.getAttribute("aria-selected") === "true");

describe("CommandPalette — rendering", () => {
  it("lists every command under the default group with count and shortcut", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Paleta de comandos" })).toBeInTheDocument();
    expect(screen.getByText("Acciones")).toBeInTheDocument();
    expect(screen.queryByText("Recientes")).not.toBeInTheDocument();
    expect(optionLabels()).toEqual(["Abrir PreferenciasCtrl+,", "Ver historial", "Tier list"]);
    expect(screen.getByText("3 comandos")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+,").tagName).toBe("KBD");
  });

  it("highlights the first command and points aria-activedescendant at it", () => {
    const { input } = setup();
    expect(selected()).toHaveAttribute("id", "cmd-prefs");
    expect(input).toHaveAttribute("aria-activedescendant", "cmd-prefs");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("renders custom groups as separate sections in first-seen order", () => {
    setup([
      { id: "a", label: "Alpha", group: "Vistas", action: vi.fn() },
      { id: "b", label: "Beta", group: "Vistas", action: vi.fn() },
      { id: "c", label: "Gamma", group: "Datos", action: vi.fn() },
    ]);
    const vistas = screen.getByText("Vistas").parentElement!;
    const datos = screen.getByText("Datos").parentElement!;
    expect(within(vistas).getAllByRole("option").map((o) => o.textContent)).toEqual(["Alpha", "Beta"]);
    expect(within(datos).getAllByRole("option").map((o) => o.textContent)).toEqual(["Gamma"]);
    expect(screen.getByText("Gamma").closest("[role=option]")).toHaveAttribute("data-cmd-idx", "2");
  });

  it("shows recent commands first under 'Recientes', skipping unknown ids", () => {
    store.set(RECENT_KEY, JSON.stringify(["tier", "ghost", "history"]));
    setup();
    const recentBlock = screen.getByText("Recientes").parentElement!;
    expect(within(recentBlock).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Tier list",
      "Ver historial",
    ]);
    const restBlock = screen.getByText("Acciones").parentElement!;
    expect(within(restBlock).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Abrir PreferenciasCtrl+,",
    ]);
    // Recent rows come first in keyboard order too.
    expect(selected()).toHaveAttribute("id", "cmd-tier");
  });

  it.each([
    ["corrupt JSON", "{not json"],
    ["a non-array value", JSON.stringify({ id: "tier" })],
  ])("ignores %s in the recent store", (_name, raw) => {
    store.set(RECENT_KEY, raw);
    setup();
    expect(screen.queryByText("Recientes")).not.toBeInTheDocument();
    expect(optionLabels()).toHaveLength(3);
  });

  it("renders an empty palette with zero count when there are no commands", () => {
    setup([]);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("0 comandos")).toBeInTheDocument();
  });
});

describe("CommandPalette — filtering", () => {
  it("filters case-insensitively into a flat list without group headers", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "VER" } });
    expect(optionLabels()).toEqual(["Ver historial"]);
    expect(screen.queryByText("Acciones")).not.toBeInTheDocument();
    expect(screen.getByText("1 comandos")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-activedescendant", "cmd-history");
  });

  it("shows the no-results message with the query and no active descendant", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText('Sin resultados para "zzz"')).toBeInTheDocument();
    expect(screen.getByText("Prueba con menos caracteres o usa palabras clave.")).toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(screen.getByText("0 comandos")).toBeInTheDocument();
  });

  it("resets the highlight to the first match when the query changes", () => {
    const { input } = setup();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selected()).toHaveAttribute("id", "cmd-tier");
    fireEvent.change(input, { target: { value: "i" } });
    // "i" matches all three; highlight goes back to index 0.
    expect(selected()).toHaveAttribute("id", "cmd-prefs");
  });
});

describe("CommandPalette — keyboard and mouse", () => {
  it("moves the highlight with arrows and clamps at both ends", () => {
    const { input } = setup();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(selected()).toHaveAttribute("id", "cmd-prefs");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selected()).toHaveAttribute("id", "cmd-history");
    expect(input).toHaveAttribute("aria-activedescendant", "cmd-history");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selected()).toHaveAttribute("id", "cmd-tier");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(selected()).toHaveAttribute("id", "cmd-history");
  });

  it("Enter runs the highlighted command, records it as recent and closes", () => {
    const { input, commands, onClose } = setup();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commands[1].action).toHaveBeenCalledTimes(1);
    expect(commands[0].action).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(RECENT_KEY)!)).toEqual(["history"]);
  });

  it("Enter with no matches does nothing", () => {
    const { input, commands, onClose } = setup();
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    commands.forEach((c) => expect(c.action).not.toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(store.has(RECENT_KEY)).toBe(false);
  });

  it("other keys are ignored", () => {
    const { input, commands, onClose } = setup();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(selected()).toHaveAttribute("id", "cmd-prefs");
    commands.forEach((c) => expect(c.action).not.toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("click runs the command and moves it to the front of a deduped recent list", () => {
    store.set(RECENT_KEY, JSON.stringify(["history", "tier"]));
    const { commands, onClose } = setup();
    fireEvent.click(screen.getByText("Tier list"));
    expect(commands[2].action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(RECENT_KEY)!)).toEqual(["tier", "history"]);
    // onClose is a mock, so the palette stays mounted: the in-memory recent
    // state is reloaded and the "Recientes" section reorders.
    const recentBlock = screen.getByText("Recientes").parentElement!;
    expect(within(recentBlock).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Tier list",
      "Ver historial",
    ]);
  });

  it("caps the recent list at five entries", () => {
    store.set(RECENT_KEY, JSON.stringify(["a", "b", "c", "d", "e", "f"]));
    setup();
    fireEvent.click(screen.getByText("Ver historial"));
    expect(JSON.parse(store.get(RECENT_KEY)!)).toEqual(["history", "a", "b", "c", "d"]);
  });

  it("hovering a row makes it the active one", () => {
    const { input } = setup();
    fireEvent.mouseEnter(screen.getByText("Tier list").closest("[role=option]")!);
    expect(selected()).toHaveAttribute("id", "cmd-tier");
    expect(input).toHaveAttribute("aria-activedescendant", "cmd-tier");
  });

  it("still runs commands when localStorage throws", () => {
    // Separate stub: mockImplementation on the shared `storage` would survive
    // vi.clearAllMocks and leak into later tests.
    const deny = () => {
      throw new Error("denied");
    };
    const throwing = { getItem: vi.fn(deny), setItem: vi.fn(deny) };
    vi.stubGlobal("localStorage", throwing);
    const { input, commands, onClose } = setup();
    expect(throwing.getItem).toHaveBeenCalled();
    expect(optionLabels()).toHaveLength(3);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commands[0].action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(throwing.setItem).toHaveBeenCalled();
  });

  it("closes on Escape and on backdrop click, not on clicks inside", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText("3 comandos"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // Regression: with interleaved groups the grouped render order (by group) differs
  // from `filtered` order (by command order), but data-cmd-idx/activeIndex
  // index into `filtered`. Commands [A(g1), B(g2), C(g1)] render as A, C, B
  // with idx 0,1,2, so highlighting the 2nd visible row (C) and pressing
  // Enter used to run B.
  it("Enter runs the visually highlighted command when groups interleave", () => {
    const cmds: Command[] = [
      { id: "a", label: "Alpha", group: "Uno", action: vi.fn() },
      { id: "b", label: "Beta", group: "Dos", action: vi.fn() },
      { id: "c", label: "Gamma", group: "Uno", action: vi.fn() },
    ];
    const { input } = setup(cmds);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selected()).toHaveTextContent("Gamma");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cmds[2].action).toHaveBeenCalledTimes(1);
    expect(cmds[1].action).not.toHaveBeenCalled();
  });
});
