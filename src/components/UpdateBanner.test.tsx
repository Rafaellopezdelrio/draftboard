// UpdateBanner contract: hidden unless an update is available; shows version,
// current version and notes; "Instalar" runs installUpdate and reports
// download progress; the close button dismisses for the session.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { UpdateBanner } from "./UpdateBanner";
import type { UpdateInfo } from "../services/appUpdater";

const h = vi.hoisted(() => ({
  info: { available: false } as UpdateInfo,
  installUpdate: vi.fn(),
}));
vi.mock("../services/appUpdater", () => ({
  useUpdateCheck: () => h.info,
  installUpdate: h.installUpdate,
}));

beforeEach(() => {
  h.info = { available: true, version: "0.5.0", currentVersion: "0.4.2", releaseNotes: "Fix overlay" };
  h.installUpdate.mockReset();
});

describe("UpdateBanner", () => {
  it("renders nothing when no update is available", () => {
    h.info = { available: false };
    const { container } = render(<UpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the new version, current version and release notes", () => {
    render(<UpdateBanner />);
    expect(screen.getByText("0.5.0")).toBeInTheDocument();
    expect(screen.getByText(/Versión nueva disponible:/)).toBeInTheDocument();
    expect(screen.getByText("(actual 0.4.2)")).toBeInTheDocument();
    expect(screen.getByText("Fix overlay")).toHaveAttribute("title", "Fix overlay");
  });

  it("omits current version and notes when the updater doesn't provide them", () => {
    h.info = { available: true, version: "0.5.0" };
    render(<UpdateBanner />);
    expect(screen.queryByText(/actual/)).not.toBeInTheDocument();
    expect(screen.queryByText("Fix overlay")).not.toBeInTheDocument();
  });

  it("dismisses for the session via the close button", () => {
    const { container } = render(<UpdateBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("installs with progress feedback and re-enables when control returns", async () => {
    let progress!: (d: number, t: number) => void;
    let finish!: () => void;
    h.installUpdate.mockImplementation((cb: (d: number, t: number) => void) => {
      progress = cb;
      return new Promise<void>((res) => {
        finish = res;
      });
    });
    const { container } = render(<UpdateBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Instalar" }));

    // installing, no total yet -> 0% and no progress bar
    expect(screen.getByRole("button", { name: "0%..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled();
    expect(container.querySelector("[style]")).toBeNull();

    act(() => progress(50, 200));
    expect(screen.getByRole("button", { name: "25%..." })).toBeDisabled();
    expect((container.querySelector("[style]") as HTMLElement).style.width).toBe("25%");

    await act(async () => finish());
    expect(screen.getByRole("button", { name: "Instalar" })).toBeEnabled();
    expect(container.querySelector("[style]")).toBeNull();
  });
});
