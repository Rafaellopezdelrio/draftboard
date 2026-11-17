// FeedbackModal contract:
//   - The user picks Sugerencia/Error, writes a note and it goes to our
//     worker via sendReport(kind, note, details); success toasts and closes.
//   - "Datos técnicos" (ticked by default) attaches version + Windows.
//   - Send is disabled for blank notes. Sending does not depend on the
//     automatic-reports setting (it is the user's own explicit action).
//   - If it does not arrive: error toast, the modal stays open with the text.
//   - Backdrop, X and Cancel close; clicks inside the card don't.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FeedbackModal } from "./FeedbackModal";

const h = vi.hoisted(() => ({ push: vi.fn(), sendReport: vi.fn() }));
vi.mock("../services/reports", () => ({
  sendReport: h.sendReport,
  technicalDetails: () => "Draftboard 9.9.9 · Windows NT 10.0",
}));
vi.mock("./ui/ToastContainer", () => ({ useToast: () => ({ push: h.push }) }));

beforeEach(() => {
  h.push.mockReset();
  h.sendReport.mockReset().mockResolvedValue(undefined);
});

const sendBtn = () => screen.getByRole("button", { name: "Enviar" });
const textarea = () => screen.getByRole("textbox");

describe("FeedbackModal", () => {
  it("renders with the prefill and disables send for blank notes", () => {
    render(<FeedbackModal prefill="   " onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Sugerencia o error" })).toBeInTheDocument();
    expect(textarea()).toHaveValue("   ");
    expect(sendBtn()).toBeDisabled();
    fireEvent.change(textarea(), { target: { value: "algo" } });
    expect(sendBtn()).toBeEnabled();
  });

  it("sends a trimmed suggestion with technical data, toasts and closes", async () => {
    const onClose = vi.fn();
    render(<FeedbackModal contextTag="header" onClose={onClose} />);
    fireEvent.change(textarea(), { target: { value: "  más campeones en la tier list  " } });
    fireEvent.click(sendBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(h.sendReport).toHaveBeenCalledWith(
      "suggestion",
      "más campeones en la tier list",
      "Draftboard 9.9.9 · Windows NT 10.0 · from: header"
    );
    expect(h.push).toHaveBeenCalledWith({ type: "success", title: "Enviado", detail: "Ha llegado. Gracias por avisar." });
  });

  it("sends as a bug when the user picks Error, without technical data if unticked", async () => {
    render(<FeedbackModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Error" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(textarea(), { target: { value: "se queda en blanco" } });
    fireEvent.click(sendBtn());
    await waitFor(() => expect(h.sendReport).toHaveBeenCalledWith("bug", "se queda en blanco", undefined));
  });

  it("opens as a bug report from the crash screen", () => {
    render(<FeedbackModal contextTag="error-boundary" prefill="crash" onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Error" })).toHaveAttribute("aria-checked", "true");
  });

  it("says it was not sent and keeps the text when the server fails", async () => {
    h.sendReport.mockRejectedValue(new Error("HTTP 503"));
    const onClose = vi.fn();
    render(<FeedbackModal prefill="nota" onClose={onClose} />);
    fireEvent.click(sendBtn());
    await waitFor(() => expect(h.push).toHaveBeenCalled());
    const toast = h.push.mock.calls[0][0];
    expect(toast.type).toBe("error");
    expect(toast.title).toBe("No se ha enviado");
    expect(toast.detail).toContain("HTTP 503");
    expect(onClose).not.toHaveBeenCalled();
    expect(textarea()).toHaveValue("nota");
    expect(sendBtn()).toBeEnabled();
  });

  it("closes from backdrop, X and Cancel but not from clicks inside the card", () => {
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} />);
    fireEvent.click(textarea());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
