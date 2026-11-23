import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "./Skeleton";

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
});
