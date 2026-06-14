// Locked-down contract for ChampionPicker:
//   - Dialog ARIA: role="dialog" + aria-modal + aria-labelledby
//   - Listbox semantics: role="listbox" + role="option"
//   - Click on an option fires onPick with that champion
//   - Search filter narrows the visible options
//   - Empty result renders role="status" + aria-live="polite"
//   - Role filter buttons expose role="tab" + aria-selected
//
// IMPORTANT: arrow-key grid nav was REMOVED — it broke mouse wheel +
// caused a re-render storm on hover. Keep that behaviour out.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChampionPicker } from "./ChampionPicker";
import { i18n } from "../i18n";
import type { Champion } from "../types/champion";

function mockChamp(overrides: Partial<Champion> = {}): Champion {
  return {
    key: overrides.key ?? "Aatrox",
    name: overrides.name ?? "Aatrox",
    iconUrl: "https://example.com/icon.png",
    roles: overrides.roles ?? ["TOP"],
    tags: ["Fighter"],
    ...overrides,
  } as Champion;
}

const CHAMPS: Champion[] = [
  mockChamp({ key: "Aatrox", name: "Aatrox", roles: ["TOP"] }),
  mockChamp({ key: "Ahri", name: "Ahri", roles: ["MIDDLE"] }),
  mockChamp({ key: "Akali", name: "Akali", roles: ["MIDDLE", "TOP"] }),
  mockChamp({ key: "Bard", name: "Bard", roles: ["UTILITY"] }),
  mockChamp({ key: "Caitlyn", name: "Caitlyn", roles: ["BOTTOM"] }),
];

describe("ChampionPicker — ARIA + mouse contract", () => {
  it("renders as role=dialog with aria-modal + aria-labelledby", () => {
    render(<ChampionPicker champions={CHAMPS} onPick={() => {}} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).toHaveTextContent(i18n.t("championPicker.title"));
  });

  it("renders role=listbox with role=option entries", () => {
    render(<ChampionPicker champions={CHAMPS} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(CHAMPS.length);
  });

  it("click on a champion fires onPick", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<ChampionPicker champions={CHAMPS} onPick={onPick} onClose={() => {}} />);
    await user.click(screen.getByRole("option", { name: /Ahri/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].name).toBe("Ahri");
  });

  it("search filter narrows the visible options", async () => {
    const user = userEvent.setup();
    render(<ChampionPicker champions={CHAMPS} onPick={() => {}} onClose={() => {}} />);
    await user.type(
      screen.getByRole("textbox", { name: /Buscar campeón/ }),
      "ah"
    );
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Ahri");
  });

  it("role filter shows role=tablist + role=tab + aria-selected", () => {
    render(<ChampionPicker champions={CHAMPS} onPick={() => {}} onClose={() => {}} />);
    expect(
      screen.getByRole("tablist", { name: /Filtrar por rol/ })
    ).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6); // ALL + 5 roles
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("excludeKeys removes those champions from the list", () => {
    render(
      <ChampionPicker
        champions={CHAMPS}
        excludeKeys={["Ahri", "Bard"]}
        onPick={() => {}}
        onClose={() => {}}
      />
    );
    const names = screen.getAllByRole("option").map((b) => b.textContent);
    expect(names).not.toContain(expect.stringContaining("Ahri"));
    expect(names).not.toContain(expect.stringContaining("Bard"));
  });

  it("empty filter result renders role=status + aria-live=polite", async () => {
    const user = userEvent.setup();
    render(<ChampionPicker champions={CHAMPS} onPick={() => {}} onClose={() => {}} />);
    await user.type(
      screen.getByRole("textbox", { name: /Buscar campeón/ }),
      "zzz-no-match"
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(i18n.t("championPicker.noResults"));
  });

  it("backdrop click fires onClose, dialog click does NOT", () => {
    const onClose = vi.fn();
    render(<ChampionPicker champions={CHAMPS} onPick={() => {}} onClose={onClose} />);
    // Click on the listbox area — inside the dialog body, should NOT close.
    fireEvent.click(screen.getByRole("listbox"));
    expect(onClose).not.toHaveBeenCalled();
    // Click on the outer backdrop — should close.
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT register grid arrow-key handlers (mouse-first)", async () => {
    // Regression test: previous version used keyboard arrow nav that
    // intercepted preventDefault on grid keydown + scrollIntoView on
    // selection change, which fought the mouse wheel. Pressing arrow
    // keys must not throw and must not change the rendered DOM (no
    // active option indicator beyond initial render).
    const user = userEvent.setup();
    render(<ChampionPicker champions={CHAMPS} onPick={() => {}} onClose={() => {}} />);
    const input = screen.getByRole("textbox", { name: /Buscar campeón/ });
    input.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    // All options remain aria-selected="false" — no active tracking.
    for (const opt of screen.getAllByRole("option")) {
      expect(opt).toHaveAttribute("aria-selected", "false");
    }
  });
});
