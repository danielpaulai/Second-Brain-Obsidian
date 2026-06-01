import { createAdminClient } from "./supabase/admin";

/**
 * Structured-brain access layer.
 *
 * The agent reaches the relational tables through exactly two calls:
 *   - describeBrain()  → learn the schema (cheap, cached) before writing SQL
 *   - aiQuery(sql)     → run ONE read-only SELECT and get JSON rows back
 *
 * Both go through SECURITY DEFINER Postgres functions (see migration 0004)
 * that enforce SELECT-only. This keeps token usage tiny: the agent asks an
 * aggregate question, writes ~1 line of SQL, and gets back a handful of rows
 * instead of reading thousands of tokens of markdown.
 */

export type BrainColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  note: string | null;
};

let schemaCache: { text: string; at: number } | null = null;
const SCHEMA_TTL_MS = 5 * 60_000;

/** Compact, token-efficient rendering of the schema for the system prompt / tool. */
export async function describeBrain(): Promise<string> {
  if (schemaCache && Date.now() - schemaCache.at < SCHEMA_TTL_MS) {
    return schemaCache.text;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("describe_brain");
  if (error) {
    console.error("[structured] describe_brain failed:", error);
    return "";
  }
  const rows = (data as BrainColumn[]) || [];
  const byTable = new Map<string, string[]>();
  for (const r of rows) {
    const col = `${r.column_name} ${compactType(r.data_type)}${r.note ? ` -- ${r.note}` : ""}`;
    const arr = byTable.get(r.table_name) || [];
    arr.push(col);
    byTable.set(r.table_name, arr);
  }
  const text = [...byTable.entries()]
    .map(([t, cols]) => `TABLE ${t}\n  ${cols.join("\n  ")}`)
    .join("\n\n");
  schemaCache = { text, at: Date.now() };
  return text;
}

function compactType(t: string): string {
  return t
    .replace("timestamp with time zone", "timestamptz")
    .replace("character varying", "text")
    .replace("double precision", "numeric");
}

export type AiQueryResult =
  | { ok: true; rows: unknown[]; rowCount: number }
  | { ok: false; error: string };

/** Run a single read-only SELECT via the ai_query RPC. */
export async function aiQuery(sql: string): Promise<AiQueryResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("ai_query", { query_text: sql });
  if (error) {
    return { ok: false, error: error.message };
  }
  const rows = Array.isArray(data) ? data : [];
  return { ok: true, rows, rowCount: rows.length };
}
