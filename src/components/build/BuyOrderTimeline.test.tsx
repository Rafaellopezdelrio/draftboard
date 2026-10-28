// BuyOrderTimeline: one cell per present phase (starter → sixth) with its
// heuristic timing, deduped/filtered item ids (max 3 icons), the Core 3 cell
// emphasised, and nothing at all when no phase is present.

import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BuyOrderTimeline } from "./BuyOrderTimeline";
import type { OpggBuildPath } from "../../services/opggBuilds";

const PATCH = "16.21.1";

const path = (ids: number[]): OpggBuildPath => ({
  ids,
  names: [],
  play: 1000,
  win: 520,
  pickRate: 0.2,
});

const NONE = {
  starter: null,
  boots: null,
  core: null,
  fourth: null,
  fifth: null,
  sixth: null,
  patch: PATCH,
};

function cellIds(cell: HTMLElement): string[] {
  return Array.from(cell.querySelectorAll("img")).map(
    (img) => img.getAttribute("src")!.match(/item\/(\d+)\.png$/)![1]
  );
}

describe("BuyOrderTimeline", () => {
  it("renders nothing when no phase is present", () => {
    const { container } = render(<BuyOrderTimeline {...NONE} />);
    expect(container.innerHTML).toBe("");
  });

  it("lays out every phase in buy order with its approximate timing", () => {
    render(
      <BuyOrderTimeline
        {...NONE}
        starter={path([1055, 2003])}
        boots={path([3006])}
        core={path([3031, 3094, 3036])}
        fourth={path([3046])}
        fifth={path([3072])}
        sixth={path([3139])}
      />
    );

    expect(screen.getByText("Orden de compra · timeline")).toBeInTheDocument();
    const times = ["0:00", "~6:00", "~22:00", "~28:00", "~35:00", "~40:00+"];
    const labels = ["Inicio", "Botas", "Core 3", "4º", "5º", "6º"];
    times.forEach((time, i) => {
      const cell = screen.getByText(time).parentElement as HTMLElement;
      expect(cell).toHaveTextContent(labels[i]);
      expect(cell).toHaveAttribute("title", `${labels[i]} · aprox ${time}`);
    });

    // DOM order follows the purchase order.
    const order = Array.from(document.querySelectorAll("[title*='aprox']")).map(
      (el) => el.getAttribute("title")
    );
    expect(order).toEqual(labels.map((l, i) => `${l} · aprox ${times[i]}`));

    const starterCell = screen.getByText("0:00").parentElement as HTMLElement;
    expect(cellIds(starterCell)).toEqual(["1055", "2003"]);
    expect(starterCell.querySelector("img")).toHaveAttribute(
      "src",
      `https://ddragon.leagueoflegends.com/cdn/${PATCH}/img/item/1055.png`
    );
  });

  it("emphasises only the Core 3 cell", () => {
    render(
      <BuyOrderTimeline {...NONE} starter={path([1055])} core={path([3031, 3094, 3036])} />
    );
    const core = screen.getByText("~22:00").parentElement as HTMLElement;
    const starter = screen.getByText("0:00").parentElement as HTMLElement;
    expect(core.className).toContain("ring-accent/40");
    expect(starter.className).not.toContain("ring-accent/40");
    expect(screen.getByText("Core 3").className).toContain("text-accent");
    expect(screen.getByText("Inicio").className).not.toContain("text-accent");
  });

  it("dedups ids, drops non-positive ones and caps a cell at 3 icons", () => {
    render(<BuyOrderTimeline {...NONE} core={path([3031, 0, 3031, -1, 3094, 3036, 3046])} />);
    const core = screen.getByText("~22:00").parentElement as HTMLElement;
    expect(cellIds(core)).toEqual(["3031", "3094", "3036"]);
  });

  it("skips a phase whose ids are all invalid but keeps the others", () => {
    render(<BuyOrderTimeline {...NONE} starter={path([0, -5])} boots={path([3006])} />);
    expect(screen.queryByText("0:00")).toBeNull();
    expect(screen.queryByText("Inicio")).toBeNull();
    expect(screen.getByText("~6:00")).toBeInTheDocument();
  });

  it("hides an icon whose image fails to load", () => {
    render(<BuyOrderTimeline {...NONE} boots={path([3006])} />);
    const img = (screen.getByText("~6:00").parentElement as HTMLElement).querySelector("img")!;
    fireEvent.error(img);
    expect(img.style.display).toBe("none");
  });
});
