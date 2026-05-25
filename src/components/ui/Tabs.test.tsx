// Pin down the WAI-ARIA tabs pattern on our underline-tabs component:
//   - role="tablist" + role="tab" + aria-selected
//   - Roving tabindex (only active tab is tabbable)
//   - Arrow Left/Right cycles, wraps at ends
//   - Home/End jump to first/last

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./Tabs";

const TABS = [
  { value: "a", label: "Alfa" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
] as const;

describe("Tabs — WAI-ARIA tabs pattern", () => {
  it("renders role=tablist on the container", () => {
    render(<Tabs tabs={[...TABS]} active="a" onChange={() => {}} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("renders role=tab on every button and marks the active one aria-selected", () => {
    render(<Tabs tabs={[...TABS]} active="b" onChange={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(tabs[2]).toHaveAttribute("aria-selected", "false");
  });

  it("applies roving tabindex (active=0, others=-1)", () => {
    render(<Tabs tabs={[...TABS]} active="b" onChange={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "-1");
    expect(tabs[1]).toHaveAttribute("tabindex", "0");
    expect(tabs[2]).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight on active fires onChange with the NEXT tab value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={[...TABS]} active="a" onChange={onChange} />);
    const first = screen.getAllByRole("tab")[0];
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("ArrowRight WRAPS from the last tab back to the first", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={[...TABS]} active="c" onChange={onChange} />);
    const last = screen.getAllByRole("tab")[2];
    last.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("ArrowLeft WRAPS from the first tab back to the last", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={[...TABS]} active="a" onChange={onChange} />);
    const first = screen.getAllByRole("tab")[0];
    first.focus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("Home jumps to the first tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={[...TABS]} active="c" onChange={onChange} />);
    screen.getAllByRole("tab")[2].focus();
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("End jumps to the last tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={[...TABS]} active="a" onChange={onChange} />);
    screen.getAllByRole("tab")[0].focus();
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("Click on a tab still fires onChange with that value (legacy mouse path)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={[...TABS]} active="a" onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("ariaLabel is forwarded to the tablist for screen readers", () => {
    render(
      <Tabs
        tabs={[...TABS]}
        active="a"
        onChange={() => {}}
        ariaLabel="Test tabs"
      />
    );
    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-label",
      "Test tabs"
    );
  });
});
