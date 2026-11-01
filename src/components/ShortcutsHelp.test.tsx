// ShortcutsHelp contract: static overlay listing every shortcut grouped by
// area, closable via the X button, Escape or a backdrop click (but not by
// clicks inside the card).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ShortcutsHelp } from "./ShortcutsHelp";

function setup() {
  const onClose = vi.fn();
  const utils = render(<ShortcutsHelp onClose={onClose} />);
  return { onClose, ...utils };
}

describe("ShortcutsHelp", () => {
  it("renders the title, the four groups and the footer", () => {
    setup();
    expect(screen.getByRole("heading", { level: 2, name: "Atajos de teclado" })).toBeInTheDocument();
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["Navegación", "Draft", "Overlay in-game", "Diálogos"]);
    expect(screen.getByText("¿Falta uno? Reporta y lo añadimos.")).toBeInTheDocument();
  });

  it("pairs each label with its key combo inside the right group", () => {
    setup();
    const nav = screen.getByText("Navegación").closest("section")!;
    const navRows = within(nav).getAllByRole("listitem");
    expect(navRows).toHaveLength(3);
    expect(navRows[0]).toHaveTextContent("Abrir paleta de comandos");
    expect(within(navRows[0]).getByText("Ctrl + K").tagName).toBe("KBD");
    expect(navRows[1]).toHaveTextContent(/^Ver este panel de atajosCtrl \+ \/$/);
    expect(navRows[2]).toHaveTextContent(/^Cerrar modal \/ cancelar acciónEsc$/);

    const overlay = screen.getByText("Overlay in-game").closest("section")!;
    // Translated key labels (not literal combos) still land in <kbd>.
    expect(within(overlay).getAllByRole("listitem").map((r) => r.textContent)).toEqual([
      "Mover ventana overlayArrastrar barra superior",
      "Ocultar overlayX (en chip)",
      "Mostrar manualmente sin partidaCtrl + K → Forzar overlay",
    ]);
    expect(within(overlay).getByText("Arrastrar barra superior").tagName).toBe("KBD");
    expect(within(overlay).getByText("X (en chip)").tagName).toBe("KBD");
    expect(within(overlay).getByText("Ctrl + K → Forzar overlay").tagName).toBe("KBD");

    const dialogs = screen.getByText("Diálogos").closest("section")!;
    expect(within(dialogs).getAllByRole("listitem").map((r) => r.textContent)).toEqual([
      "Confirmar acciónEnter",
      "CancelarEsc",
    ]);
  });

  it("shows the optional detail only for items that define one", () => {
    setup();
    const draft = screen.getByText("Draft").closest("section")!;
    const [roleRow, resetRow] = within(draft).getAllByRole("listitem");
    expect(roleRow).toHaveTextContent("Seleccionar rol");
    expect(within(roleRow).getByText("TOP, JUNGLE, MID, BOT, SUP")).toBeInTheDocument();
    expect(within(roleRow).getByText("1 – 5")).toBeInTheDocument();
    expect(resetRow).toHaveTextContent("Reset draft");
    expect(resetRow).toHaveTextContent(/^Reset draftR$/);
  });

  it("closes via the X button", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on clicks inside the card", () => {
    const { onClose, container } = setup();
    fireEvent.click(screen.getByText("Atajos de teclado"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
