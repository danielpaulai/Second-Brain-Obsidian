# Deploying AI Danny to Vercel

The local dev environment reads your Obsidian vault directly from disk (`VAULT_PATH`). Vercel functions don't have local filesystem access to your laptop, so production uses **Vercel Blob storage** instead.

## Architecture in production

```
┌────────────────────────────────────────────────────────────┐
│ Local machine                                              │
│  /Users/.../Obsidian Vault/                                │
│         │                                                  │
│         │ node scripts/sync-to-blob.mjs                    │
│         ▼                                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Vercel Blob                                         │    │
│  │   /vault/<user_id>/<path>.md  (your markdown)       │    │
│  │   /knowledge/<user_id>/<slug>.md (distilled)        │    │
│  │   /brain-index/<user_id>/lance.tar (LanceDB)        │    │
│  └────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
                              ▲
                              │ reads from Blob
                              │
                       ┌──────────────┐
                       │ Vercel       │
                       │ functions    │
                       │ (Fluid)      │
                       └──────────────┘
```

## One-time setup

### 1. Create Vercel project

```bash
pnpm add -g vercel@latest
cd "Second Brain Obsidian App"
vercel link        # picks/creates project
```

### 2. Provision Vercel Blob

```bash
vercel storage create blob ai-danny-vault
```

The CLI prints a `BLOB_READ_WRITE_TOKEN`. Save it.

### 3. Set environment variables in Vercel

Settings → Environment Variables. Mirror your local `.env.local` plus:

```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
ANTHROPIC_API_KEY=sk-ant-...
AI_GATEWAY_API_KEY=vck_...           # optional, fallback
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OWNER_EMAIL=danny@danielpaul.ai
NEXT_PUBLIC_TEAM_PASSWORD=...
AI_MODEL=anthropic/claude-sonnet-4-6
# NOTE: do NOT set VAULT_PATH in prod — server detects Blob mode when absent.
```

### 4. Configure Supabase Auth → Redirect URLs

Supabase Dashboard → Authentication → URL Configuration. Add:

```
https://<your-vercel-domain>.vercel.app/auth/callback
https://<custom-domain>/auth/callback     # if you mapped one
```

### 5. Sync your vault → Blob

From your local machine:

```bash
node scripts/sync-to-blob.mjs
```

This uploads:
- `_ai-danny/*.md` (MASTER, identity, privacy rules, knowledge map)
- All vault notes (full)
- The LanceDB index folder

Re-run anytime you've edited the vault locally. Or set up a watcher.

### 6. Deploy

```bash
vercel deploy --prod
```

## Per-route runtime config (vercel.json)

| Route | Timeout | Memory |
|---|---|---|
| `/api/chat` | 90s | 1024 MB |
| `/api/brain/reindex` | 300s | 2048 MB |
| `/api/brain/search` | 30s | 1024 MB |
| `/api/brain/note` | 15s | 512 MB |
| `/api/knowledge/*` | 15s | 512 MB |

Default function timeout on Vercel is now 300s on all plans, so this is just trimming.

## Storage cost projection

| Asset | Size | Vercel Blob cost |
|---|---|---|
| Your vault (2,194 .md files, ~150 MB total) | ~150 MB | $0.023/GB/month → ~$0.004/mo |
| Knowledge map (266 distilled files, ~728K words) | ~5 MB | negligible |
| LanceDB index | ~150 MB | $0.004/mo |
| **Total storage** | ~300 MB | **~$0.01/month** |

**Bandwidth**: every chat request reads ~3 files from Blob (~50KB). At 1,000 chats/month that's 50MB out → free tier covers it.

## Local dev still works

The code paths fall back to filesystem when `VAULT_PATH` is set and Blob isn't. Your laptop remains the source of truth — Blob is the read replica for production.
