// Markdown: AI coach answers must read as text, never as raw "**" symbols.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("bold becomes bold text and the asterisks disappear", () => {
    const { container } = render(<Markdown source={"**Patrón principal:** ganas 6 de cada 10."} />);
    expect(screen.getByText("Patrón principal:").tagName).toBe("STRONG");
    expect(container.textContent).not.toContain("*");
  });

  it("bold split across two lines of one paragraph still pairs up", () => {
    const { container } = render(<Markdown source={"una **falta de control\nde objetivos** clara"} />);
    expect(screen.getByText("falta de control de objetivos").tagName).toBe("STRONG");
    expect(container.textContent).not.toContain("*");
  });

  it("an unpaired ** left by the model is dropped, not shown", () => {
    const { container } = render(<Markdown source={"muestran una **falta de visión"} />);
    expect(container.textContent).toBe("muestran una falta de visión");
  });

  it("bullets and numbered lines become lists; headings lose their #", () => {
    const { container } = render(
      <Markdown source={"## Plan\n- Día 1: farmear\n- Día 2: visión\n\n1. uno\n2. dos"} />
    );
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(container.textContent).not.toContain("#");
    expect(screen.getByText("Plan")).toBeInTheDocument();
  });

  it("long unbroken text can wrap instead of pushing the bubble sideways", () => {
    const { container } = render(<Markdown source={"(15+16+3+10+9+8+3+5+23+1)÷(5+5+1+7+7+2+4+9+7+0)"} />);
    expect((container.firstChild as HTMLElement).className).toContain("break-words");
  });
});
