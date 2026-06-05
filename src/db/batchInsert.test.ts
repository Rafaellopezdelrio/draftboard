import { describe, it, expect } from "vitest";
import { buildBatchInserts } from "./batchInsert";

describe("buildBatchInserts", () => {
  it("returns nothing for empty rows", () => {
    expect(buildBatchInserts("t", ["a", "b"], [])).toEqual([]);
  });

  it("builds a single multi-row statement under the param budget", () => {
    const [chunk, ...rest] = buildBatchInserts("meta", ["a", "b"], [
      [1, 2],
      [3, 4],
    ]);
    expect(rest).toHaveLength(0);
    expect(chunk.sql).toBe("INSERT INTO meta (a, b) VALUES ($1, $2), ($3, $4)");
    expect(chunk.params).toEqual([1, 2, 3, 4]);
  });

  it("chunks when the row count exceeds the param budget", () => {
    // 2 cols, maxParams 4 → 2 rows/chunk → 3 rows = 2 chunks.
    const chunks = buildBatchInserts(
      "t",
      ["a", "b"],
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      4
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].params).toEqual([1, 2, 3, 4]);
    // Placeholders re-number from $1 within each chunk.
    expect(chunks[1].sql).toBe("INSERT INTO t (a, b) VALUES ($1, $2)");
    expect(chunks[1].params).toEqual([5, 6]);
  });

  it("always keeps at least one row per chunk even with a tiny budget", () => {
    const chunks = buildBatchInserts("t", ["a", "b", "c"], [[1, 2, 3]], 1);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].params).toEqual([1, 2, 3]);
  });
});
