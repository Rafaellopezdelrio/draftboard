// Accessibility smoke tests. Runs axe-core against rendered components
// to catch common a11y regressions (missing alt text, color contrast,
// missing labels, invalid ARIA, focus traps without escape, etc).
//
// Strategy: import the LEAVES (presentational components) rather than
// modal containers that depend on app state. axe rules find issues
// regardless — and a leaf assertion is cheaper than mocking a full
// store + DB + LCU bridge to test e.g. CoachView.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

// vitest-axe's matcher types target Vitest 0.x. Vitest 2.x exposes
// Assertion<T> as generic — augmenting it without matching the generic
// shape causes "All declarations must have identical type parameters".
// Use the lighter `Assertion` overload by intersecting via interface
// merging on the inner Assertion type instead.
declare module "vitest" {
  interface Assertion<T> {
    toHaveNoViolations: T extends unknown ? () => void : never;
  }
}

import { EmptyState } from "../components/ui/EmptyState";
import { Panel, PanelHeader } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { GradeBadge } from "../components/ui/GradeBadge";
import { TierBadge } from "../components/ui/TierBadge";
import { SparkLine } from "../components/ui/SparkLine";

describe("A11Y smoke — UI leaves have no axe violations", () => {
  it("EmptyState renders accessibly", async () => {
    const { container } = render(
      <EmptyState
        title="No data"
        detail="Connect the client to populate this view."
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Panel with header renders accessibly", async () => {
    const { container } = render(
      <Panel padding="sm">
        <PanelHeader title="Test panel" subtitle="subtitle" />
        <p>content</p>
      </Panel>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("StatCard renders accessibly", async () => {
    const { container } = render(
      <StatCard value={42} label="Wins" color="good" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("GradeBadge renders accessibly", async () => {
    const { container } = render(<GradeBadge score={0.85} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("TierBadge renders accessibly", async () => {
    const { container } = render(<TierBadge tier="S+" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("SparkLine renders accessibly", async () => {
    const { container } = render(
      <SparkLine data={[40, 50, 60, 55, 70, 65, 80]} width={200} height={40} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
