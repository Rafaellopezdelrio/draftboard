// Regression: with interleaved groups the palette renders grouped order,
// so the keyboard index must point into that same order — not into the
// raw `commands` order — or Enter runs a different row than highlighted.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette, type Command } from "./CommandPalette";

function cmd(id: string, group: string): Command {
  return { id, label: `Cmd ${id}`, group, action: vi.fn() };
}

describe("CommandPalette — Enter runs the highlighted row", () => {
  beforeEach(() => {
    // Recent list lives in localStorage; start every test with none.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    // jsdom has no layout, so scrollIntoView is missing.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("interleaved groups: ArrowDown + Enter runs the second rendered row", () => {
    const a = cmd("a", "G1");
    const b = cmd("b", "G2");
    const c = cmd("c", "G1");
    const onClose = vi.fn();
    render(<CommandPalette commands={[a, b, c]} onClose={onClose} />);

    // Rendered order is G1: a, c — then G2: b.
    const rows = screen.getAllByRole("option").map((el) => el.textContent);
    expect(rows).toEqual(["Cmd a", "Cmd c", "Cmd b"]);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { selected: true }).textContent).toBe("Cmd c");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(c.action).toHaveBeenCalledTimes(1);
    expect(b.action).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("typed query: Enter runs the first match", () => {
    const a = cmd("a", "G1");
    const b = cmd("b", "G2");
    render(<CommandPalette commands={[a, b]} onClose={vi.fn()} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "cmd b" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(b.action).toHaveBeenCalledTimes(1);
    expect(a.action).not.toHaveBeenCalled();
  });
});
