// HeaderMenu contract: trigger toggles a portal menu positioned under the
// trigger (right-aligned, clamped to 8px); picking an item runs it and closes;
// Escape and outside mousedown close; mousedown inside the menu doesn't.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeaderMenu, type MenuItem } from "./HeaderMenu";

// document.addEventListener spies must not leak if an assertion fails.
afterEach(() => {
  vi.restoreAllMocks();
});

function setup(rect: Partial<DOMRect> = { bottom: 40, right: 500 }) {
  const items: MenuItem[] = [
    { label: "Ajustes", icon: <i data-testid="ic-a" />, onClick: vi.fn() },
    { label: "Acerca de", icon: <i />, onClick: vi.fn() },
  ];
  const utils = render(<HeaderMenu label="Más" icon={<i />} items={items} />);
  const trigger = screen.getByRole("button", { name: "Más" });
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
  return { ...utils, items, trigger };
}

describe("HeaderMenu", () => {
  it("is closed initially and opens a portal menu positioned under the trigger", () => {
    const { trigger, container } = setup();
    expect(screen.queryByRole("button", { name: "Ajustes" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const item = screen.getByRole("button", { name: "Ajustes" });
    const menu = item.parentElement as HTMLElement;
    // portal: rendered into body, not inside the component's container
    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
    expect(menu.style.top).toBe("46px");
    expect(menu.style.left).toBe("300px");
    expect(screen.getByTestId("ic-a")).toBeInTheDocument();
    expect(trigger.querySelector("svg")).toHaveClass("rotate-180");
  });

  it("clamps the left edge to 8px when the trigger is near the viewport's left", () => {
    const { trigger } = setup({ bottom: 10, right: 100 });
    fireEvent.click(trigger);
    const menu = screen.getByRole("button", { name: "Ajustes" }).parentElement as HTMLElement;
    expect(menu.style.left).toBe("8px");
    expect(menu.style.top).toBe("16px");
  });

  it("runs the item's onClick and closes", () => {
    const { trigger, items } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Acerca de" }));
    expect(items[1].onClick).toHaveBeenCalledTimes(1);
    expect(items[0].onClick).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Acerca de" })).not.toBeInTheDocument();
  });

  it("toggles closed when the trigger is clicked again", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("button", { name: "Ajustes" })).not.toBeInTheDocument();
  });

  it("closes on Escape but ignores other keys", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Ajustes" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Ajustes" })).not.toBeInTheDocument();
  });

  it("closes on outside mousedown, not on mousedown inside the menu or trigger", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Ajustes" }));
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole("button", { name: "Ajustes" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Ajustes" })).not.toBeInTheDocument();
  });

  it("removes the exact document listeners it added when closed", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { trigger } = setup();
    fireEvent.click(trigger);
    const added = (type: string) => addSpy.mock.calls.find((c) => c[0] === type)?.[1];
    const onMouseDown = added("mousedown");
    const onKeyDown = added("keydown");
    expect(onMouseDown).toBeTypeOf("function");
    expect(onKeyDown).toBeTypeOf("function");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(removeSpy).toHaveBeenCalledWith("mousedown", onMouseDown);
    expect(removeSpy).toHaveBeenCalledWith("keydown", onKeyDown);
  });

  it("removes its document listeners on unmount while open", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { trigger, unmount } = setup();
    fireEvent.click(trigger);
    const added = (type: string) => addSpy.mock.calls.find((c) => c[0] === type)?.[1];
    const onMouseDown = added("mousedown");
    const onKeyDown = added("keydown");
    expect(onMouseDown).toBeTypeOf("function");
    expect(removeSpy).not.toHaveBeenCalledWith("mousedown", onMouseDown);

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("mousedown", onMouseDown);
    expect(removeSpy).toHaveBeenCalledWith("keydown", onKeyDown);
  });
});
