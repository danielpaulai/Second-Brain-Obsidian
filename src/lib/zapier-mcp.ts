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
