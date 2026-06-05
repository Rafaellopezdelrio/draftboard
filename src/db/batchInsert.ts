// Multi-row INSERT batching for the aggregation sync.
//
// tauri-plugin-sql runs each `db.execute()` against a connection from a Rust
// sqlx pool, so a `BEGIN`/`COMMIT` split across separate execute() calls is
// NOT guaranteed to land on the same connection — the codebase deliberately
// avoids cross-call transactions. The next-best thing for atomicity + speed is
// to collapse thousands of single-row INSERTs into a handful of multi-row
// statements: each statement is atomic on its own, and we go from ~N round
// trips to ~N/rowsPerChunk.
//
// Chunked to stay well under SQLite's bound parameter limit (999 on pre-3.32
// builds; we target ~900 to be safe regardless of the bundled SQLite version).

export interface InsertChunk {
  sql: string;
  params: unknown[];
}

/** Build chunked multi-row INSERT statements for `rows`. Returns one
 *  {sql, params} per chunk; empty when there are no rows. Pure + tested. */
export function buildBatchInserts(
  table: string,
  columns: string[],
  rows: unknown[][],
  maxParams = 900
): InsertChunk[] {
  if (rows.length === 0 || columns.length === 0) return [];
  const rowsPerChunk = Math.max(1, Math.floor(maxParams / columns.length));
  const cols = columns.join(", ");
  const out: InsertChunk[] = [];

  for (let start = 0; start < rows.length; start += rowsPerChunk) {
    const chunk = rows.slice(start, start + rowsPerChunk);
    let p = 0;
    const tuples = chunk.map(
      (row) => `(${row.map(() => `$${++p}`).join(", ")})`
    );
    out.push({
      sql: `INSERT INTO ${table} (${cols}) VALUES ${tuples.join(", ")}`,
      params: chunk.flat(),
    });
  }
  return out;
}
