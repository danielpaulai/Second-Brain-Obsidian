# AI Danny

Your second brain + your exec team, in one dashboard.

- **3D brain graph** of your Obsidian vault (nodes pulse when an agent queries them).
- **Multi-agent chat**: AI Danny (face), CEO, COO, CFO, CMO, CRO — all share a `queryBrain` tool against your real vault.
- **Phase 1**: Next.js web app (this repo). **Phase 2**: Obsidian plugin (thin client → same API).

## Setup

```bash
pnpm install
cp .env.local.example .env.local
# edit .env.local — set ANTHROPIC_API_KEY (or AI_GATEWAY_API_KEY) and VAULT_PATH
pnpm dev
```

Open http://localhost:3000.

## Env

| var | what |
|---|---|
| `VAULT_PATH` | absolute path to your Obsidian vault |
| `ANTHROPIC_API_KEY` | direct Anthropic key, or… |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key (one key, any model) |
| `AI_MODEL` | default model id, e.g. `anthropic/claude-sonnet-4-6` |
| `VAULT_EXCLUDE` | comma-separated folders to skip |

## Deploy

```bash
vercel
```

Set the same env vars in the Vercel project. For the deployed version, mount the vault via Vercel Blob or sync to a hosted MCP — local filesystem won't work in prod.

## What it looks like

- Left: 3D force graph of your vault (Three.js). Hover for note name + folder; drag to rotate.
- Right: chat panel. Switch agents at the top. Tool calls show inline (`🔍 queryBrain("…") → 6 notes`). Cited notes pulse in the graph.
- Top bar: live stats (notes, links, folders, last edit).

## Phase 2 — Obsidian plugin

Same `/api/chat` endpoint, called from an Obsidian sidebar panel. The web app stays the polished daily-use interface; the plugin gives you a quick "ask AI Danny about this note" panel inside the vault.
