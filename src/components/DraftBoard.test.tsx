// DraftBoard drives the real draftStore + real ChampionPicker:
//   - Empty board: 2 columns, 5 ban + 5 pick slots each, no reset button
//   - Click a pick/ban slot -> picker -> chosen champ written to the store
//   - Picker hides already picked/banned champions
//   - Reset button only when something is set AND LCU is not connected
//   - Right-click on a filled slot dispatches the champion-guide event

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftBoard } from "./DraftBoard";
import { useDraftStore } from "../state/draftStore";
import type { ChampionDb } from "../types/champion";

function champ(key: string, id: string, name: string, title: string) {
  return {
    key,
    id,
    name,
    title,
    iconUrl: `https://cdn.test/${id}.png`,
    splashUrl: `https://cdn.test/${id}_0.jpg`,
    tags: [],
    roles: ["TOP"],
    archetypes: [],
  };
}

const db = {
  patch: "14.10.1",
  champions: {
    "266": champ("266", "Aatrox", "Aatrox", "the Darkin Blade"),
    "103": champ("103", "Ahri", "Ahri", "the Nine-Tailed Fox"),
    "222": champ("222", "Jinx", "Jinx", "the Loose Cannon"),
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

function column(title: string): HTMLElement {
  return screen.getByRole("heading", { name: title }).closest(".space-y-2") as HTMLElement;
}

describe("DraftBoard", () => {
  beforeEach(() => {
    useDraftStore.getState().reset();
  });

  it("renders both columns with 5 empty ban and pick slots and no reset button", () => {
    render(<DraftBoard db={db} />);
    for (const title of ["Tu equipo", "Enemigos"]) {
      const col = within(column(title));
      for (let n = 1; n <= 5; n++) {
        expect(col.getByRole("button", { name: `Pick ${n}` })).toBeInTheDocument();
        expect(col.getByTitle(`Ban ${n}`)).toBeInTheDocument();
      }
    }
    expect(screen.queryByRole("button", { name: /Reiniciar draft/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("picking from an ally slot writes the champion to the store and shows it", async () => {
    const user = userEvent.setup();
    render(<DraftBoard db={db} />);

    await user.click(within(column("Tu equipo")).getByRole("button", { name: "Pick 2" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Ahri/ }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useDraftStore.getState().ally[1].championKey).toBe("103");
    expect(useDraftStore.getState().enemy.every((s) => s.championKey === null)).toBe(true);

    const slot = screen.getByTitle("Click derecho: ver guía de Ahri");
    expect(within(slot).getByText("the Nine-Tailed Fox")).toBeInTheDocument();
    expect(within(slot).getByRole("img", { name: "Ahri" })).toHaveAttribute(
      "src",
      "https://cdn.test/Ahri.png"
    );
    // Other ally slots stay empty.
    expect(within(column("Tu equipo")).queryByRole("button", { name: "Pick 2" })).toBeNull();
    expect(within(column("Tu equipo")).getByRole("button", { name: "Pick 1" })).toBeInTheDocument();
  });

  it("banning from an enemy ban slot writes the ban index and renders the banned icon", async () => {
    const user = userEvent.setup();
    render(<DraftBoard db={db} />);

    await user.click(within(column("Enemigos")).getByTitle("Ban 3"));
    await user.click(screen.getByRole("option", { name: /Jinx/ }));

    expect(useDraftStore.getState().bans.enemy[2]).toBe("222");
    expect(useDraftStore.getState().bans.ally).toEqual([]);
    const enemyCol = within(column("Enemigos"));
    expect(enemyCol.getByTitle("Jinx")).toBeInTheDocument();
    expect(enemyCol.queryByTitle("Ban 3")).toBeNull();
    // Ally side untouched.
    expect(within(column("Tu equipo")).getByTitle("Ban 3")).toBeInTheDocument();
  });

  it("the picker excludes champions already picked or banned on either side", async () => {
    const user = userEvent.setup();
    useDraftStore.getState().setPick("ally", 0, "266");
    useDraftStore.getState().setBan("enemy", 0, "103");
    render(<DraftBoard db={db} />);

    await user.click(within(column("Enemigos")).getByRole("button", { name: "Pick 1" }));
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Jinx");
  });

  it("Escape closes the picker without touching the store", async () => {
    const user = userEvent.setup();
    render(<DraftBoard db={db} />);
    await user.click(within(column("Tu equipo")).getByRole("button", { name: "Pick 1" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useDraftStore.getState().ally.every((s) => s.championKey === null)).toBe(true);
  });

  it("shows the reset button once something is set and clears the draft on click", async () => {
    const user = userEvent.setup();
    useDraftStore.getState().setPick("enemy", 4, "222");
    useDraftStore.getState().setBan("ally", 0, "266");
    render(<DraftBoard db={db} />);

    await user.click(screen.getByRole("button", { name: /Reiniciar draft/ }));

    const s = useDraftStore.getState();
    expect(s.enemy[4].championKey).toBeNull();
    expect(s.bans).toEqual({ ally: [], enemy: [] });
    expect(screen.queryByRole("button", { name: /Reiniciar draft/ })).toBeNull();
    expect(within(column("Enemigos")).getByRole("button", { name: "Pick 5" })).toBeInTheDocument();
  });

  it("a lone enemy ban enables reset, but it is hidden while the LCU drives the draft", () => {
    useDraftStore.getState().setBan("enemy", 0, "103");
    const { rerender } = render(<DraftBoard db={db} />);
    expect(screen.getByRole("button", { name: /Reiniciar draft/ })).toBeInTheDocument();

    rerender(<DraftBoard db={db} lcuConnected />);
    expect(screen.queryByRole("button", { name: /Reiniciar draft/ })).toBeNull();
  });

  it("right-click on a filled slot dispatches the champion guide event; empty slot does nothing", () => {
    useDraftStore.getState().setPick("enemy", 0, "266");
    render(<DraftBoard db={db} />);
    const listener = vi.fn();
    window.addEventListener("draft:show-champion-guide", listener);
    try {
      const filled = screen.getByTitle("Click derecho: ver guía de Aatrox");
      // fireEvent returns false when the handler called preventDefault().
      expect(fireEvent.contextMenu(filled)).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ championKey: "266" });

      const empty = within(column("Tu equipo")).getByRole("button", { name: "Pick 1" });
      expect(fireEvent.contextMenu(empty)).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("draft:show-champion-guide", listener);
    }
  });
});
