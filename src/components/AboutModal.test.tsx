// AboutModal contract:
//   - Version from Tauri getVersion ("dev" outside Tauri, "unknown" on failure).
//   - "Check for updates" toasts new version / up to date / failure, showing
//     a loading label meanwhile; outside Tauri it warns instead of checking.
//   - "Open logs folder" opens appLogDir via the opener plugin; failures show
//     an inline status. "View logs" / "Report issue" open child modals.
//   - Backdrop and close icon call onClose.
//
// Child modals are stubbed; they have their own tests.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AboutModal } from "./AboutModal";

const h = vi.hoisted(() => ({
  getVersion: vi.fn(),
  openPath: vi.fn(),
  check: vi.fn(),
  appLogDir: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: h.getVersion }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: h.openPath }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: h.check }));
vi.mock("@tauri-apps/api/path", () => ({ appLogDir: h.appLogDir }));
vi.mock("./ui/ToastContainer", () => ({ useToast: () => ({ push: h.push }) }));
vi.mock("./FeedbackModal", () => ({
  FeedbackModal: ({ contextTag, onClose }: { contextTag?: string; onClose: () => void }) => (
    <div data-testid="feedback">
      feedback-{contextTag}
      <button onClick={onClose}>cerrar-feedback</button>
    </div>
  ),
}));
vi.mock("./LogViewerModal", () => ({
  LogViewerModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="logviewer">
      <button onClick={onClose}>cerrar-logs</button>
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.getVersion.mockResolvedValue("1.2.3");
});

async function renderModal() {
  const onClose = vi.fn();
  await act(async () => {
    render(<AboutModal onClose={onClose} />);
  });
  return { onClose };
}

async function withoutTauri(fn: () => Promise<void>) {
  const g = globalThis as Record<string, unknown>;
  delete g.__TAURI_INTERNALS__;
  try {
    await fn();
  } finally {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }
}

const btn = (name: string | RegExp) => screen.getByRole("button", { name });
const versionValue = () => screen.getByText("Versión").nextElementSibling?.textContent;

describe("AboutModal — version", () => {
  it("shows the version reported by Tauri plus build and platform rows", async () => {
    await renderModal();
    expect(screen.getByRole("dialog", { name: "Acerca de Draftboard" })).toBeInTheDocument();
    expect(versionValue()).toBe("1.2.3");
    expect(screen.getByText("release")).toBeInTheDocument();
    expect(screen.getByText("Windows / Tauri 2")).toBeInTheDocument();
  });

  it("shows 'unknown' when getVersion fails", async () => {
    h.getVersion.mockRejectedValue(new Error("ipc down"));
    await renderModal();
    expect(versionValue()).toBe("unknown");
  });

  it("shows 'dev' outside Tauri without calling getVersion", async () => {
    await withoutTauri(async () => {
      await renderModal();
      expect(versionValue()).toBe("dev");
      expect(h.getVersion).not.toHaveBeenCalled();
    });
  });
});

describe("AboutModal — update check", () => {
  it("toasts the new version and shows a disabled loading button meanwhile", async () => {
    let resolve!: (v: unknown) => void;
    h.check.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderModal();
    fireEvent.click(btn("Buscar actualizaciones"));
    expect(btn("Cargando...")).toBeDisabled();

    await act(async () => {
      resolve({ version: "1.3.0" });
    });
    expect(h.push).toHaveBeenCalledWith({
      type: "success",
      title: "Nueva versión: 1.3.0",
      detail: "Banner superior para instalar.",
    });
    expect(btn("Buscar actualizaciones")).toBeEnabled();
  });

  it("toasts 'up to date' with the current version when there is no update", async () => {
    h.check.mockResolvedValue(null);
    await renderModal();
    await act(async () => {
      fireEvent.click(btn("Buscar actualizaciones"));
    });
    expect(h.push).toHaveBeenCalledWith({
      type: "success",
      title: "Estás en la última versión",
      detail: "v1.2.3",
    });
  });

  it("toasts the error message when the check fails and re-enables the button", async () => {
    h.check.mockRejectedValue(new Error("network unreachable"));
    await renderModal();
    await act(async () => {
      fireEvent.click(btn("Buscar actualizaciones"));
    });
    expect(h.push).toHaveBeenCalledWith({
      type: "error",
      title: "No se pudo comprobar updates",
      detail: "network unreachable",
    });
    expect(btn("Buscar actualizaciones")).toBeEnabled();
  });

  it("warns instead of checking outside Tauri", async () => {
    await withoutTauri(async () => {
      await renderModal();
      await act(async () => {
        fireEvent.click(btn("Buscar actualizaciones"));
      });
      expect(h.check).not.toHaveBeenCalled();
      expect(h.push).toHaveBeenCalledWith({
        type: "warn",
        title: "Solo disponible en la app de escritorio",
      });
    });
  });
});

describe("AboutModal — logs and feedback", () => {
  it("opens the app log directory in the file browser", async () => {
    h.appLogDir.mockResolvedValue("C:\\Users\\rafa\\AppData\\Local\\com.draftboard.app\\logs");
    h.openPath.mockResolvedValue(undefined);
    await renderModal();
    await act(async () => {
      fireEvent.click(btn("Abrir carpeta de logs"));
    });
    expect(h.openPath).toHaveBeenCalledWith("C:\\Users\\rafa\\AppData\\Local\\com.draftboard.app\\logs");
  });

  it("shows an inline status when opening the log folder fails", async () => {
    h.appLogDir.mockResolvedValue("C:/logs");
    h.openPath.mockRejectedValue(new Error("access denied"));
    await renderModal();
    await act(async () => {
      fireEvent.click(btn("Abrir carpeta de logs"));
    });
    expect(screen.getByText("No pude abrir la carpeta de logs: access denied")).toBeInTheDocument();
  });

  it("starting an update check clears a previous inline status", async () => {
    h.appLogDir.mockResolvedValue("C:/logs");
    h.openPath.mockRejectedValue(new Error("access denied"));
    h.check.mockResolvedValue(null);
    await renderModal();
    await act(async () => {
      fireEvent.click(btn("Abrir carpeta de logs"));
    });
    expect(screen.getByText(/No pude abrir la carpeta de logs/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(btn("Buscar actualizaciones"));
    });
    expect(screen.queryByText(/No pude abrir la carpeta de logs/)).not.toBeInTheDocument();
  });

  it("does nothing on 'open logs' outside Tauri", async () => {
    await withoutTauri(async () => {
      await renderModal();
      await act(async () => {
        fireEvent.click(btn("Abrir carpeta de logs"));
      });
      expect(h.appLogDir).not.toHaveBeenCalled();
      expect(h.openPath).not.toHaveBeenCalled();
    });
  });

  it("opens and closes the in-app log viewer", async () => {
    await renderModal();
    expect(screen.queryByTestId("logviewer")).not.toBeInTheDocument();
    fireEvent.click(btn("Ver logs"));
    expect(screen.getByTestId("logviewer")).toBeInTheDocument();
    fireEvent.click(btn("cerrar-logs"));
    expect(screen.queryByTestId("logviewer")).not.toBeInTheDocument();
  });

  it("opens the feedback modal tagged 'about' and closes it", async () => {
    await renderModal();
    fireEvent.click(btn("Reportar un problema"));
    expect(screen.getByTestId("feedback")).toHaveTextContent("feedback-about");
    fireEvent.click(btn("cerrar-feedback"));
    expect(screen.queryByTestId("feedback")).not.toBeInTheDocument();
  });
});

describe("AboutModal — closing", () => {
  it("close icon and backdrop call onClose; clicks inside the dialog don't", async () => {
    const { onClose } = await renderModal();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(btn("Cerrar"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
