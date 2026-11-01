// FeedbackModal contract:
//   - Sends the trimmed note to Sentry as "[user-feedback(:tag)] <note>",
//     toasts success and closes.
//   - Send is disabled for empty/whitespace notes and when telemetry is off
//     (an inline warning explains why).
//   - A Sentry failure toasts the error and keeps the modal open.
//   - Backdrop, X and Cancel close; clicks inside the card don't.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FeedbackModal } from "./FeedbackModal";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";

const h = vi.hoisted(() => ({ push: vi.fn(), captureMessage: vi.fn() }));
vi.mock("../services/sentry", () => ({ captureMessage: h.captureMessage }));
vi.mock("./ui/ToastContainer", () => ({ useToast: () => ({ push: h.push }) }));

function setTelemetry(on: boolean) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, telemetryEnabled: on } });
}

beforeEach(() => {
  h.push.mockReset();
  h.captureMessage.mockReset();
  setTelemetry(true);
});

const sendBtn = () => screen.getByRole("button", { name: "Enviar" });
const textarea = () => screen.getByPlaceholderText(/Qué pasó/);

describe("FeedbackModal", () => {
  it("renders the dialog with the prefill and disables send for blank notes", () => {
    render(<FeedbackModal prefill="   " onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Reportar problema" })).toBeInTheDocument();
    expect(textarea()).toHaveValue("   ");
    expect(sendBtn()).toBeDisabled();
    expect(screen.queryByText(/Telemetría desactivada/)).not.toBeInTheDocument();

    fireEvent.change(textarea(), { target: { value: "algo" } });
    expect(sendBtn()).toBeEnabled();
  });

  it("sends the trimmed note without tag, toasts success and closes", () => {
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} />);
    fireEvent.change(textarea(), { target: { value: "  el panel se quedó en blanco  " } });
    fireEvent.click(sendBtn());

    expect(h.captureMessage).toHaveBeenCalledWith("[user-feedback] el panel se quedó en blanco", {
      level: "info",
      tags: undefined,
    });
    expect(h.push).toHaveBeenCalledWith({
      type: "success",
      title: "Reporte enviado",
      detail: "Lo revisamos en breve. Gracias por avisar.",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("includes the context tag in message and Sentry tags", () => {
    render(<FeedbackModal contextTag="after-crash" prefill="crash al abrir" onClose={vi.fn()} />);
    fireEvent.click(sendBtn());
    expect(h.captureMessage).toHaveBeenCalledWith("[user-feedback:after-crash] crash al abrir", {
      level: "info",
      tags: { feedback_tag: "after-crash" },
    });
  });

  it("shows the telemetry-off warning and blocks sending when telemetry is disabled", () => {
    setTelemetry(false);
    render(<FeedbackModal prefill="nota" onClose={vi.fn()} />);
    expect(screen.getByText(/Telemetría desactivada. Actívala/)).toBeInTheDocument();
    expect(sendBtn()).toBeDisabled();
    fireEvent.click(sendBtn());
    expect(h.captureMessage).not.toHaveBeenCalled();
  });

  it("toasts the error and stays open when Sentry throws", () => {
    h.captureMessage.mockImplementation(() => {
      throw new Error("boom");
    });
    const onClose = vi.fn();
    render(<FeedbackModal prefill="nota" onClose={onClose} />);
    fireEvent.click(sendBtn());

    expect(h.push).toHaveBeenCalledWith({
      type: "error",
      title: "No pude enviar",
      detail: "Error: boom",
    });
    expect(onClose).not.toHaveBeenCalled();
    // busy is reset in finally, so the button is usable again
    expect(sendBtn()).toBeEnabled();
  });

  it("truncates the error detail to 200 characters", () => {
    h.captureMessage.mockImplementation(() => {
      throw new Error("x".repeat(500));
    });
    render(<FeedbackModal prefill="nota" onClose={vi.fn()} />);
    fireEvent.click(sendBtn());
    const detail = h.push.mock.calls[0][0].detail as string;
    expect(detail).toHaveLength(200);
    expect(detail.startsWith("Error: xxx")).toBe(true);
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
