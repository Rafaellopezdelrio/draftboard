// LolvvvProBuild shows lolvvv's pro build only for the role it was scraped
// for (lolvvv server-renders the champion's primary role alone), and the
// apply button must push the exact 9-perk page to the client.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LolvvvProBuild } from "./LolvvvProBuild";
import * as lolvvv from "../../services/lolvvvBuilds";
import * as lcu from "../../services/lcuService";

vi.mock("../../services/lolvvvBuilds", () => ({ fetchLolvvvBuild: vi.fn() }));
vi.mock("../../services/lcuService", () => ({ applyRunes: vi.fn() }));

afterEach(() => vi.clearAllMocks());

const PERKS = [8010, 9111, 9105, 8299, 8444, 8453, 5008, 5008, 5011];
const BUILD: lolvvv.LolvvvBuild = {
  championId: 266,
  role: "TOP",
  games: 157,
  regions: [
    { id: "KR", games: 73 },
    { id: "EUW1", games: 66 },
    { id: "NA1", games: 0 },
  ],
  spells: { ids: [4, 12], pickRate: 0.7 },
  skillOrder: "QEWQQRQEQE",
  skillMax: "QEW",
  starter: { ids: [1054, 2003], pickRate: 0.48 },
  items: [
    { id: 6692, pickRate: 0.27 },
    { id: 3161, pickRate: 0.32 },
    { id: 6694, pickRate: 0.35 },
  ],
  boots: { id: 3047, pickRate: 0.73 },
  runePage: { primaryStyleId: 8000, subStyleId: 8400, selectedPerkIds: PERKS, pickRate: 0.72 },
};

describe("LolvvvProBuild", () => {
  it("renders the pro build for its role, regions without the platform digit", async () => {
    vi.mocked(lolvvv.fetchLolvvvBuild).mockResolvedValue(BUILD);
    render(<LolvvvProBuild championId="Aatrox" championName="Aatrox" role="TOP" patch="16.21.1" />);

    expect(await screen.findByText("Build de pros")).toBeTruthy();
    expect(screen.getByText("157 partidas · KR / EUW")).toBeTruthy();
    expect(screen.getByText("27%")).toBeTruthy();
    expect(lolvvv.fetchLolvvvBuild).toHaveBeenCalledWith("Aatrox");
  });

  it("renders nothing on an off-role pick", async () => {
    vi.mocked(lolvvv.fetchLolvvvBuild).mockResolvedValue(BUILD);
    const { container } = render(
      <LolvvvProBuild championId="Aatrox" championName="Aatrox" role="JUNGLE" patch="16.21.1" />
    );
    await waitFor(() => expect(lolvvv.fetchLolvvvBuild).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("applies the full rune page to the client", async () => {
    vi.mocked(lolvvv.fetchLolvvvBuild).mockResolvedValue(BUILD);
    vi.mocked(lcu.applyRunes).mockResolvedValue(true);
    render(<LolvvvProBuild championId="Aatrox" championName="Aatrox" role="TOP" patch="16.21.1" />);

    fireEvent.click(await screen.findByText("Aplicar →"));
    await waitFor(() =>
      expect(lcu.applyRunes).toHaveBeenCalledWith({
        name: "Aatrox · Pros",
        primaryStyleId: 8000,
        subStyleId: 8400,
        selectedPerkIds: PERKS,
      })
    );
    expect(await screen.findByText("✓ Aplicadas")).toBeTruthy();
  });
});
