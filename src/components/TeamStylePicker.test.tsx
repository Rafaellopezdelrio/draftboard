import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamStylePicker } from "./TeamStylePicker";

describe("TeamStylePicker", () => {
  it("lists the five styles with what each means, and says it is optional", () => {
    render(<TeamStylePicker style={null} suggested={null} onChange={() => {}} />);
    for (const name of ["Engage", "Poke y control de zonas", "Proteger al carry", "Pick", "Split"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.getByText(/todo el equipo cuida al que hace el daño/)).toBeInTheDocument();
    expect(screen.getByText(/Opcional/)).toBeInTheDocument();
  });

  it("marks the suggested style and says why", () => {
    render(<TeamStylePicker style={null} suggested="poke" onChange={() => {}} />);
    expect(screen.getByText("Por vuestros campeones os va mejor: Poke y control de zonas (★).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Poke y control de zonas/ })).toHaveTextContent("★");
  });

  it("one click picks a style, a second click clears it", () => {
    const onChange = vi.fn();
    const { rerender } = render(<TeamStylePicker style={null} suggested={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Engage" }));
    expect(onChange).toHaveBeenLastCalledWith("engage");
    rerender(<TeamStylePicker style="engage" suggested={null} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Engage" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Estilo: Engage/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Engage" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("compact (champ select): just the buttons", () => {
    render(<TeamStylePicker style={null} suggested={null} onChange={() => {}} compact />);
    expect(screen.queryByText(/todo el equipo cuida/)).toBeNull();
    expect(screen.getByRole("button", { name: "Split" })).toBeInTheDocument();
  });
});
