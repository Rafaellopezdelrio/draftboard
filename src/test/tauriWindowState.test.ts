// Wiring test for tauri-plugin-window-state. The plugin saves window
// size/position on close and restores on next launch — feature users
// rely on but that we can't exercise end-to-end without booting Tauri
// twice (out of scope for vitest/Playwright dev mode).
//
// What this test CAN do: assert that the plugin is registered in the
// Tauri builder + that the Cargo dep exists. A regression here (someone
// removes the .plugin() line during a refactor) would silently break
// window restoration for every user — but only on the NEXT cold boot.
// Hard to spot manually; cheap to lock down with this static check.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

describe("tauri-plugin-window-state wiring", () => {
  it("Cargo.toml declares the plugin as a dependency", () => {
    const cargo = readFileSync(
      resolve(REPO_ROOT, "src-tauri/Cargo.toml"),
      "utf-8"
    );
    expect(cargo).toMatch(/tauri-plugin-window-state\s*=/);
  });

  it("lib.rs registers the plugin with the Tauri builder", () => {
    const lib = readFileSync(
      resolve(REPO_ROOT, "src-tauri/src/lib.rs"),
      "utf-8"
    );
    expect(lib).toMatch(/tauri_plugin_window_state::Builder::default\(\)/);
    // .plugin(...) is the registration call. Both must coexist in
    // sequence — `.plugin(tauri_plugin_window_state::...)`. Loosely
    // check both tokens land in the same line for confidence.
    const pluginLine = lib
      .split("\n")
      .find((l) => l.includes("tauri_plugin_window_state"));
    expect(pluginLine).toBeTruthy();
    expect(pluginLine!).toMatch(/\.plugin\(/);
  });

  it("main window declared with a stable label so the plugin can target it", () => {
    const conf = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, "src-tauri/tauri.conf.json"),
        "utf-8"
      )
    );
    const windows = conf.app?.windows ?? [];
    const main = windows.find(
      (w: { label?: string }) => w.label === "main"
    );
    expect(main, "tauri.conf.json must declare a window with label 'main'").toBeDefined();
  });
});
