/**
 * Zapier MCP — server-side access to every app the founder has connected in
 * Zapier, with NO per-app OAuth in our codebase.
 *
 * How it works: Zapier hosts a remote MCP server (Streamable HTTP) at
 * mcp.zapier.com. You create a server there, connect the apps you want (Stripe,
 * Google Analytics, etc. — that OAuth happens in Zapier's dashboard, once), and
 * Zapier gives you ONE secret server URL + token. We connect to it as an MCP
 * client and call the exposed actions as tools. Set:
 *   ZAPIER_MCP_URL   = the server URL from the Connect tab (treat as a secret)
 *   ZAPIER_MCP_TOKEN = the Bearer token (omit if the token is embedded in the URL)
 *
 * Single-tenant (the founder's own dashboard) → API-key/Bearer server. For a
 * multi-user product you'd instead use Zapier's end-user OAuth connect flow.
 *
 * Everything degrades gracefully: with no URL set, callers get configured:false.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { tool, jsonSchema, type ToolSet } from "ai";

export function zapierMcpConfigured(): boolean {
  return Boolean(process.env.ZAPIER_MCP_URL);
}

/** Connect, run `fn`, always close. A fresh client per call keeps it stateless. */
async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const url = process.env.ZAPIER_MCP_URL;
  if (!url) throw new Error("ZAPIER_MCP_URL is not set");
  const token = process.env.ZAPIER_MCP_TOKEN;
  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined
  );
  const client = new Client({ name: "second-brain-dashboard", version: "1.0.0" });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export type ZapierTool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type ZapierCallResult = { ok: boolean; data: unknown; error?: string };

function parseCallResult(res: { content?: { type: string; text?: string }[]; isError?: boolean }): ZapierCallResult {
  const text = (res.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  return { ok: !res.isError, data, error: res.isError ? text : undefined };
}

export type ZapierSession = {
  tools: ZapierTool[];
  call: (name: string, args?: Record<string, unknown>) => Promise<ZapierCallResult>;
};

/**
 * Open ONE connection, list the tools, and run `fn` with a session that can call
 * many tools over that single connection (vs connect-per-call). Always closes.
 * This is what the dashboard pipeline uses — far fewer handshakes = much faster.
 */
export async function withZapierSession<T>(fn: (s: ZapierSession) => Promise<T>): Promise<T> {
  const url = process.env.ZAPIER_MCP_URL;
  if (!url) throw new Error("ZAPIER_MCP_URL is not set");
  const token = process.env.ZAPIER_MCP_TOKEN;
  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined
  );
  const client = new Client({ name: "second-brain-dashboard", version: "1.0.0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const session: ZapierSession = {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
      })),
      call: async (name, args = {}) => {
        try {
          const res = (await client.callTool({ name, arguments: args })) as { content?: { type: string; text?: string }[]; isError?: boolean };
          return parseCallResult(res);
        } catch (err) {
          return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
        }
      },
    };
    return await fn(session);
  } finally {
    await client.close().catch(() => {});
  }
}

/** Discover the actions exposed by the configured Zapier MCP server. */
export async function listZapierTools(): Promise<ZapierTool[]> {
  if (!zapierMcpConfigured()) return [];
  try {
    return await withClient(async (client) => {
      const { tools } = await client.listTools();
      return tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
      }));
    });
  } catch (err) {
    console.error("[zapier-mcp] listTools failed:", err);
    return [];
  }
}

/** Execute one Zapier action and return its (JSON-parsed when possible) result. */
export async function callZapierTool(name: string, args: Record<string, unknown> = {}): Promise<ZapierCallResult> {
  if (!zapierMcpConfigured()) return { ok: false, data: null, error: "Zapier MCP not configured (set ZAPIER_MCP_URL)" };
  try {
    return await withClient(async (client) => parseCallResult((await client.callTool({ name, arguments: args })) as Parameters<typeof parseCallResult>[0]));
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The actions exposed for ONE connected app (by selected_api), with exact keys. */
export async function listZapierActions(selected_api: string): Promise<Array<{ key: string; name: string; write: boolean }>> {
  const r = await callZapierTool("list_enabled_zapier_actions", { selected_api });
  const d = r.data as unknown;
  const acts = (Array.isArray(d) ? (d[0] as Record<string, unknown>)?.actions : (d as Record<string, unknown>)?.actions) as Record<string, unknown>[] | undefined;
  return (acts ?? [])
    .map((a) => ({ key: String(a.key ?? ""), name: String(a.name ?? ""), write: a.tool === "execute_zapier_write_action" }))
    .filter((a) => a.key);
}

/** Resolve a (possibly guessed) action to a real key for this app: exact, then best token match. */
export function matchZapierAction(actions: Array<{ key: string; name: string }>, proposed: string): string | null {
  if (!proposed) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const p = norm(proposed);
  const exact = actions.find((a) => a.key.toLowerCase() === proposed.toLowerCase() || norm(a.key) === p || norm(a.name) === p);
  if (exact) return exact.key;
  const pTokens = p.split(/\s+/).filter(Boolean);
  let best: string | null = null;
  let bestScore = 0;
  let bestLen = Infinity;
  for (const a of actions) {
    const hay = norm(`${a.key} ${a.name}`);
    let score = 0;
    for (const t of pTokens) if (hay.includes(t)) score += 1;
    if (p && hay.includes(p)) score += 3;
    // tie-break: prefer the shortest (most specific) matching key
    if (score > bestScore || (score === bestScore && score > 0 && a.key.length < bestLen)) {
      bestScore = score;
      best = a.key;
      bestLen = a.key.length;
    }
  }
  return bestScore >= 1 ? best : null;
}

/** True when an action result is really a "key not found" error (not read content). */
function looksLikeMissingAction(r: ZapierCallResult): boolean {
  const errStr = r.error ?? "";
  const dataErr = r.data && typeof r.data === "object" ? String((r.data as Record<string, unknown>).error ?? "") : "";
  return /not found|exact key|no such action|unknown action|invalid action/i.test(`${errStr} ${dataErr}`);
}

/**
 * Execute a Zapier read/write action FOOLPROOF: always passes the required `output`
 * string; if the action key is wrong ("Action 'x' not found" — the agent guessed),
 * it resolves the key against the app's LIVE action list and retries once. If it
 * still can't match, it returns the available keys so the caller can recover.
 */
export async function executeZapierAction(
  kind: "read" | "write",
  args: { selected_api: string; action: string; instructions?: string; params?: Record<string, unknown>; output?: string }
): Promise<ZapierCallResult & { resolvedAction?: string; available?: string[] }> {
  const toolName = kind === "write" ? "execute_zapier_write_action" : "execute_zapier_read_action";
  const payload = {
    selected_api: args.selected_api,
    instructions: args.instructions ?? "",
    params: args.params ?? {},
    output: args.output ?? (kind === "write" ? "the id, link, status or confirmation of the action that ran" : ""),
  };
  let r = await callZapierTool(toolName, { ...payload, action: args.action });
  if (r.ok && !looksLikeMissingAction(r)) return r;

  // the key was wrong → resolve against the real action list and retry once
  const actions = await listZapierActions(args.selected_api);
  const resolved = matchZapierAction(actions, args.action);
  if (resolved && resolved.toLowerCase() !== args.action.toLowerCase()) {
    r = await callZapierTool(toolName, { ...payload, action: resolved });
    return { ...r, resolvedAction: resolved };
  }
  if (!resolved) {
    const available = actions.filter((a) => (kind === "write" ? a.write : true)).map((a) => a.key);
    return { ok: false, data: r.data, error: `Action '${args.action}' not found for ${args.selected_api}.`, available };
  }
  return r;
}

/**
 * The Zapier actions wrapped as Vercel AI SDK tools — drop these into a
 * generateText/streamText call so an LLM can pull the last-7-days data itself
 * (the "retrieve everything, then populate the dashboard" step). Returns {} when
 * unconfigured.
 */
export async function zapierAiTools(): Promise<ToolSet> {
  const tools = await listZapierTools();
  const out: ToolSet = {};
  for (const t of tools) {
    out[t.name] = tool({
      description: t.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: jsonSchema(t.inputSchema as any),
      execute: async (args) => {
        const r = await callZapierTool(t.name, args as Record<string, unknown>);
        return r.ok ? r.data : { error: r.error };
      },
    });
  }
  return out;
}
