import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton, SuggestionSkeleton, BuildSkeleton, ScoutCardSkeleton } from "./Skeleton";

const pulses = (c: HTMLElement) => c.querySelectorAll(".animate-pulse");

describe("Skeleton", () => {
  it("defaults to a rounded rect and appends className", () => {
    const { container } = render(<Skeleton className="w-8 h-8" />);
    const el = container.firstElementChild!;
    expect(el).toHaveClass("animate-pulse", "rounded", "w-8", "h-8");
    expect(el).not.toHaveClass("rounded-full");
    expect(el).not.toHaveClass("h-4");
  });

  it("renders circle and text variants", () => {
    const { container: c1 } = render(<Skeleton variant="circle" />);
    expect(c1.firstElementChild).toHaveClass("rounded-full");
    const { container: c2 } = render(<Skeleton variant="text" />);
    expect(c2.firstElementChild).toHaveClass("rounded", "h-4");
  });

  it("SuggestionSkeleton renders a header line plus five rows with avatar + two lines", () => {
    const { container } = render(<SuggestionSkeleton />);
    expect(pulses(container)).toHaveLength(16);
    expect(container.querySelectorAll(".animate-pulse.rounded-full")).toHaveLength(5);
  });

  it("BuildSkeleton renders title, six item squares and a footer line", () => {
    const { container } = render(<BuildSkeleton />);
    expect(pulses(container)).toHaveLength(8);
    expect(container.querySelectorAll(".animate-pulse.w-8.h-8")).toHaveLength(6);
  });

  it("ScoutCardSkeleton renders one avatar and four text lines", () => {
    const { container } = render(<ScoutCardSkeleton />);
    expect(pulses(container)).toHaveLength(5);
    expect(container.querySelectorAll(".animate-pulse.rounded-full")).toHaveLength(1);
  });
});
