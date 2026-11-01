// LogViewerModal contract:
//   - Outside Tauri: "desktop only" message, nothing read.
//   - In Tauri: reads <appLogDir>/draftboard.log (falls back to
//     Draftboard.log), backslashes normalised, shows the last 200 lines.
//   - Missing/empty file → empty state; read errors → message capped at 200 chars.
//   - Copy writes the shown lines to the clipboard and toasts; Refresh re-reads.
//   - Escape, backdrop and the close icon call onClose.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LogViewerModal } from "./LogViewerModal";

const h = vi.hoisted(() => ({
  appLogDir: vi.fn(),
  exists: vi.fn(),
  readTextFile: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({ appLogDir: h.appLogDir }));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: h.exists, readTextFile: h.readTextFile }));
vi.mock("./ui/ToastContainer", () => ({ useToast: () => ({ push: h.push }) }));

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  h.appLogDir.mockResolvedValue("C:\\Users\\rafa\\logs");
  h.exists.mockImplementation(async (p: string) => p.endsWith("/draftboard.log"));
  h.readTextFile.mockResolvedValue("line A\r\nline B\nline C");
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderModal() {
  const onClose = vi.fn();
  await act(async () => {
    render(<LogViewerModal onClose={onClose} />);
  });
  return { onClose };
}

const btn = (name: string) => screen.getByRole("button", { name });
const logText = () => document.querySelector("pre")?.textContent;

describe("LogViewerModal — loading the log", () => {
  it("shows a desktop-only message outside Tauri and reads nothing", async () => {
    const g = globalThis as Record<string, unknown>;
    delete g.__TAURI_INTERNALS__;
    try {
      await renderModal();
      expect(screen.getByText("Solo disponible en la app de escritorio")).toBeInTheDocument();
      expect(h.appLogDir).not.toHaveBeenCalled();
      expect(btn("Copiar")).toBeDisabled();
    } finally {
      Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
        value: undefined,
        writable: true,
        configurable: true,
      });
    }
  });

  it("shows the loading state while the read is pending", async () => {
    h.appLogDir.mockReturnValue(new Promise(() => {}));
    await renderModal();
    expect(screen.getByText("Cargando...")).toBeInTheDocument();
  });

  it("reads draftboard.log from the normalised log dir and splits CRLF/LF lines", async () => {
    await renderModal();
    expect(h.exists).toHaveBeenCalledWith("C:/Users/rafa/logs/draftboard.log");
    expect(h.readTextFile).toHaveBeenCalledWith("C:/Users/rafa/logs/draftboard.log");
    expect(logText()).toBe("line A\nline B\nline C");
    expect(screen.getByRole("heading", { name: "Logs · últimas 200 líneas" })).toBeInTheDocument();
    expect(btn("Copiar")).toBeEnabled();
  });

  it("falls back to Draftboard.log when the lowercase file is missing", async () => {
    h.exists.mockImplementation(async (p: string) => p.endsWith("/Draftboard.log"));
    await renderModal();
    expect(h.exists).toHaveBeenNthCalledWith(1, "C:/Users/rafa/logs/draftboard.log");
    expect(h.readTextFile).toHaveBeenCalledWith("C:/Users/rafa/logs/Draftboard.log");
    expect(logText()).toBe("line A\nline B\nline C");
  });

  it("shows the empty state when no log file exists", async () => {
    h.exists.mockResolvedValue(false);
    await renderModal();
    expect(h.readTextFile).not.toHaveBeenCalled();
    expect(screen.getByText(/Aún no hay logs/)).toBeInTheDocument();
    expect(btn("Copiar")).toBeDisabled();
  });

  it("shows the empty state when the log file is empty", async () => {
    h.readTextFile.mockResolvedValue("");
    await renderModal();
    expect(screen.getByText(/Aún no hay logs/)).toBeInTheDocument();
  });

  it("keeps only the last 200 lines", async () => {
    h.readTextFile.mockResolvedValue(Array.from({ length: 250 }, (_, i) => `L${i + 1}`).join("\n"));
    await renderModal();
    const shown = logText()!.split("\n");
    expect(shown).toHaveLength(200);
    expect(shown[0]).toBe("L51");
    expect(shown[199]).toBe("L250");
  });

  it("shows read errors truncated to 200 characters", async () => {
    h.appLogDir.mockRejectedValue(new Error("x".repeat(400)));
    await renderModal();
    const msg = screen.getByText(/^Error: x+$/);
    expect(msg.textContent).toHaveLength(200);
  });

  it("refresh re-reads the file and shows the new content", async () => {
    await renderModal();
    h.readTextFile.mockResolvedValue("fresh line");
    await act(async () => {
      fireEvent.click(btn("Refrescar"));
    });
    expect(h.readTextFile).toHaveBeenCalledTimes(2);
    expect(logText()).toBe("fresh line");
  });

  it("refresh clears a previous error when the retry succeeds", async () => {
    h.appLogDir.mockRejectedValueOnce(new Error("locked"));
    await renderModal();
    expect(screen.getByText("Error: locked")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(btn("Refrescar"));
    });
    expect(screen.queryByText("Error: locked")).not.toBeInTheDocument();
    expect(logText()).toBe("line A\nline B\nline C");
  });
});

describe("LogViewerModal — actions", () => {
  it("copy writes the shown lines and toasts the count", async () => {
    writeText.mockResolvedValue(undefined);
    await renderModal();
    await act(async () => {
      fireEvent.click(btn("Copiar"));
    });
    expect(writeText).toHaveBeenCalledWith("line A\nline B\nline C");
    expect(h.push).toHaveBeenCalledWith({
      type: "success",
      title: "Logs copiados",
      detail: "3 líneas en portapapeles",
    });
  });

  it("copy failure toasts an error", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await renderModal();
    await act(async () => {
      fireEvent.click(btn("Copiar"));
    });
    expect(h.push).toHaveBeenCalledWith({ type: "error", title: "No pude copiar" });
  });

  it("Escape, the close icon and a backdrop click call onClose; inner clicks don't", async () => {
    const { onClose } = await renderModal();
    fireEvent.click(screen.getByRole("heading", { name: /Logs/ }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(btn("Cerrar"));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("shows the log location footer", async () => {
    await renderModal();
    expect(screen.getByText(/Los logs viven en %APPDATA%\\com\.draftboard\.app\\logs\\/)).toBeInTheDocument();
  });
});
