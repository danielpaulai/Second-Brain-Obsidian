# AI Danny — Build Handoff

> Single source of truth for picking this up in VS Code. Covers what's built, what's
> pending, how to run everything, the migrations, the gotchas we hit, and the
> prioritized next steps. Last updated end of the build session (2026-06-01).

---

## 0. What this is

**AI Danny** is a personal AI operating system on top of Daniel Paul's Obsidian vault
(Daniel = founder of **Purely Personal**, a personal-branding agency for founders).
Next.js 15 (App Router) + AI SDK v4 + Supabase + LanceDB. It is **not** a chatbot —
it's the operating system Daniel reasons through.

**Hard constraint (never regress this):** privacy. No personal/client/financial info
leaks to non-owners. Three viewer tiers — `owner` (full), `team` (redacted), `public`
(principles only). Enforced server-side at the tool boundary (`src/lib/privacy.ts`).

### The three "brains" (know which to use when)
1. **Vault (markdown)** — the raw Obsidian notes. Fuzzy recall via `queryBrain`
   (hybrid keyword + semantic over LanceDB). Source of truth for prose.
2. **Memory (vectors)** — Supabase `memories` (pgvector). Cross-session facts/commitments
   extracted from chats + meetings. `searchMemories` / `storeMemories`.
3. **Structured (SQL)** — Supabase relational tables (27 of them). Exact, cheap,
   aggregatable. `queryDatabase` (read-only SQL). **This is the token-efficiency layer:**
   "pipeline value?" = 1 SQL line, not reading 50 notes.

---

## 1. Run it from zero (quickstart)

```bash
cd "/Users/danielpaul/Documents/Second Brain Obsidian App"

# Dev server — DO NOT use `pnpm dev` (see Gotchas). Use:
./node_modules/.bin/next dev --turbopack
# → http://localhost:3000
```

**To use the SQL brain / private data in chat you must sign in as the owner:**
go to `http://localhost:3000/login`, sign in with `danny@danielpaul.ai`. Without a
signed-in owner session the chat runs as `public` and refuses `queryDatabase`/`readNote`
by design.

Key pages: `/` (3D brain + chat) · `/login` · `/ask` (team chat) · `/brain-map`
(266 distilled categories) · `/memories`.

---

## 2. Environment (`.env.local`)

All set unless noted. **Values live in `.env.local` — never commit them.**

| Var | Purpose | Status |
|---|---|---|
| `ANTHROPIC_API_KEY` | Direct Anthropic (chat, distill, extract) | ✅ set |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway (not currently used — direct Anthropic) | set, idle |
| `AI_MODEL` | `anthropic/claude-sonnet-4-6` | ✅ |
| `VAULT_PATH` | `/Users/danielpaul/Documents/Obsidian/Obsidian Vault` | ✅ |
| `VAULT_EXCLUDE` | `.obsidian,.trash,node_modules,.git,_ai-danny` | ✅ |
| `NEXT_PUBLIC_TEAM_PASSWORD` | `/ask` gate | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | project `tcipazrkubpfjavlbytp` | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client auth | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only (admin writes, RPC) | ✅ |
| `OWNER_EMAIL` | `danny@danielpaul.ai` → owner role | ✅ |
| `CRON_SECRET` | Bearer auth for `/api/cron/*` + local sync scripts | ✅ |
| `SYBILL_API_KEY` | `sk_live_…` (Sybill public API) | ✅ set |
| `GRANOLA_API_KEY` | `grn_…` (Granola public API) | ✅ set |
| `APP_URL` | `http://localhost:3000` → swap to Vercel URL after deploy | ✅ |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (prod vault storage) | ⛔ **empty — pending deploy** |

---

## 3. Supabase migrations (`supabase/migrations/`)

Apply in order in the Supabase SQL Editor (paste file **contents**, not the path).
**All 5 are applied** as of this session.

| File | Creates | Status |
|---|---|---|
| `0001_profiles.sql` | `profiles` (+role), auto-trigger on signup, RLS, `team_questions` | ✅ applied |
| `0002_memories.sql` | pgvector, `memories` (1536-dim, HNSW), `match_memories()` RPC | ✅ applied |
| `0003_briefings.sql` | `briefings`, `processed_meetings` (idempotency) | ✅ applied |
| `0004_structured_brain.sql` | 9 operational tables + `ai_query()` + `describe_brain()` RPCs + RLS | ✅ applied |
| `0005_identity_knowledge.sql` | 17 identity/knowledge tables + extends `describe_brain()` | ✅ applied |

**The 27 tables:**
- *Operational (0004):* `people`, `meetings`, `meeting_attendees`, `commitments`,
  `deals`, `revenue_events`, `content_posts`, `tasks`, `metric_definitions`, `metrics`
- *Identity/Knowledge (0005):* `offers`, `offer_objections`, `case_studies`,
  `icp_segments`, `client_problems`, `solutions`, `common_issues`, `frameworks`,
  `voice_rules`, `tone_profiles`, `personality_traits`, `decision_rules`, `principles`,
  `signature_phrases`, `stories`, `content_pillars`, `hooks`

**AI access path (read-only, owner-gated):**
- `describe_brain()` → schema for the agent to learn before querying
- `ai_query(query_text)` → SELECT/WITH only, single statement, DDL blocked, returns JSON
- Surfaced to the agent as the `describeBrain` + `queryDatabase` tools (`src/lib/brain-tools.ts`)

**Distillation status:** `distill-to-sql.mjs` populated **287 rows across 15/17 tables**.
Two came back empty and need data:
- `case_studies` → filled by `backfill-structured.mjs` (real results from calls)
- `stories` → needs the distiller repointed at full category bodies (see Pending #6)

---

## 4. Scripts (`scripts/`)

All are standalone Node ESM, auto-load `.env.local`. Run from project root.

| Script | What it does | Run |
|---|---|---|
| `sync-sybill.mjs` | Sybill API → writes `Meetings/*.md` + POSTs `/api/capture/meeting` (→ memories). Incremental via `_ai-danny/.sybill-sync-state.json` | `node scripts/sync-sybill.mjs` |
| `sync-granola.mjs` | Granola **public API** (`public-api.granola.ai/v1`) → same flow. State: `.granola-sync-state.json` | `node scripts/sync-granola.mjs` |
| `sync-meetings.mjs` | Orchestrator: runs Granola then Sybill | `node scripts/sync-meetings.mjs` |
| `distill-to-sql.mjs` | Vault (MASTER + identity files + 266 categories) → 17 identity tables. Idempotent (skips non-empty; `--force`, `--only=offers,hooks`) | `node scripts/distill-to-sql.mjs` |
| `backfill-structured.mjs` | `Meetings/*.md` → `meetings`/`people`/`meeting_attendees`/`commitments`/`case_studies`. Idempotent | `node scripts/backfill-structured.mjs` |
| `draft-engine.mjs` | Watches `<vault>/Queue/` for `draft-*.md` → pulls voice/hooks/pillars/proof from SQL → drafts → writes `<vault>/Generated/`. `--watch` to poll | `node scripts/draft-engine.mjs` |
| `lib/meeting-note.mjs` | Shared: renders the Obsidian meeting note (frontmatter + summary + transcript callout) | (lib) |
| `lib/upsert-capture.mjs` | Shared: POST helper to `/api/capture/meeting` | (lib) |
| `launchd/com.aidanny.sync.plist` | macOS 30-min auto-sync (pre-filled for homebrew node) | see Pending #7 |
| `generate-icons.mjs` | PWA icons (Node-only, no sharp) | one-off |
| `distill-knowledge.mjs` / `distill-batch.mjs` | The original 266-category vault distillation (Batch API) | done |

---

## 5. API routes (`src/app/api/`)

| Route | Purpose |
|---|---|
| `chat/route.ts` | **Main chat.** Tools: `queryBrain`, `brainStats`, `recentNotes`, `readNote`, `listKnowledgeCategories`, `queryKnowledge`, **`describeBrain`, `queryDatabase`**. Memory inject + post-stream extraction. Privacy-gated. |
| `capture/meeting/route.ts` | POST transcript → extracts commitments → memories. Idempotent via `processed_meetings`. CRON_SECRET auth. |
| `cron/morning-brief/route.ts` | 7am daily → runs `morning-brief` skill → `briefings` (kind=morning) |
| `cron/weekly-review/route.ts` | Sun → `weekly-review` skill → `briefings` (kind=weekly) |
| `brief/pre-call/route.ts` | POST `{who,…}` → `pre-call-brief` skill. Owner session OR CRON_SECRET |
| `draft/generate/route.ts` | POST `{topic,format,…}` → Content Draft Engine → writes `Generated/` |
| `briefings/latest/route.ts` | GET latest morning brief (owner) + POST regen |
| `brain/*`, `knowledge/*`, `me`, `choreo` | vault graph, search, reindex, knowledge tree, auth/me |

---

## 6. Libs (`src/lib/`)

`vault.ts` (read vault, hybrid search, identity preamble) · `knowledge.ts` (266 categories)
· `agents.ts` (Danny + CEO/COO/CFO/CMO/CRO personas) · `privacy.ts` (redaction, 3 tiers)
· `memories.ts` (mem0-style extract/embed/store + transcript extraction) · `skills.ts`
(load `_ai-danny/skills/*.md`) · `skill-runner.ts` (`runSkillAsOwner` — non-streaming skill exec)
· `agent-tools.ts` (shared tool factory for skills/cron) · `structured.ts` (`aiQuery`,
`describeBrain`) · `brain-tools.ts` (`queryDatabase`/`describeBrain` tools, owner-gated)
· `embeddings.ts` / `semantic.ts` (LanceDB) · `supabase/{client,server,admin}.ts`.

---

## 7. Skills (`<vault>/_ai-danny/skills/`)

Editable markdown procedures the agent executes. Add a file → it's available next run.

| Skill | Used by |
|---|---|
| `morning-brief.md` | `/api/cron/morning-brief` |
| `weekly-review.md` | `/api/cron/weekly-review` |
| `pre-call-brief.md` | `/api/brief/pre-call` |
| `post-meeting-capture.md` | `/api/capture/meeting` (commitment extraction) |
| `draft-content.md` | `/api/draft/generate` (hard no-fabrication rule baked in) |

---

## 8. Nate Herk's "AI OS" framework — mapping + status

The **4 C's**:
- **Context** ✅ — MASTER.md + 266 categories + memories. (Optional: split into per-persona context bundles.)
- **Connections** ◑ — vault ✅; Sybill + Granola ✅ wired. Still possible: GHL/CRM, LinkedIn, Stripe.
- **Capabilities** ✅ — the `_ai-danny/skills/` system (procedural knowledge as markdown).
- **Cadence** ◑ — morning brief ✅, weekly review ✅, meeting capture ✅. Pending: 3-part brief, librarian.

**3 M's**: Mindset (privacy-first owner model ✅), Method (viewer tiers ≈ bike-method autonomy),
Machine (Anthropic direct + Supabase + Vercel ✅).
**`/insights`** (analytics over an `interactions` log) and **`/session-handoff`** (a `handoff`
memory kind) are noted but not built.

---

## 9. Instagram carousel ("Obsidian vault that runs your business") — gap analysis

Stack in the carousel: Obsidian + Claude Code + n8n. **We're ahead on the hard parts**
(structured SQL, memory, privacy, multi-source capture, exec agents). What it had that we built/owe:

| Carousel feature | Status here |
|---|---|
| CLAUDE.md identity file | ✅ MASTER.md (richer) |
| 6AM briefing (Project Pulse / Content / Intelligence) | ◑ morning brief built; **split into 3 = pending** |
| Pre-call client brief | ✅ built (`/api/brief/pre-call`) |
| Content Draft Engine (QUEUE→GENERATED) | ✅ built (`draft-engine.mjs`) |
| Weekly review writes itself | ✅ built (`/api/cron/weekly-review`) |
| Finances auto-update | ⛔ tables built, **ingestion pending** |
| Operating folder structure | ◑ `Queue/`+`Generated/` via draft engine; rest optional |
| Self-maintaining "librarian" (Ronjo) | ⛔ pending |
| n8n | ❌ skip — Vercel cron + scripts already cover it |
| OpenJarvis | ❌ skip — competing OS, not a component |

---

## 10. Gotchas we hit (read before debugging)

1. **`pnpm dev` is broken** — it aborts on `[ERR_PNPM_IGNORED_BUILDS]` (sharp/protobufjs)
   before launching Next. **Use `./node_modules/.bin/next dev --turbopack`**, or run
   `pnpm approve-builds` once to fix permanently.
2. **Empty `ANTHROPIC_API_KEY` shadow** — if a shell has `ANTHROPIC_API_KEY=""` exported,
   Next won't override it from `.env.local`, and chat fails with
   `AI_APICallError: x-api-key header is required`. Your own terminal is clean; this only
   bit a server started from a polluted shell. Fix: `env -u ANTHROPIC_API_KEY ./node_modules/.bin/next dev`.
   The chat route now also reads the key per-request via `createAnthropic({apiKey})` to harden this.
3. **Turbopack workspace-root warning** — a stray `/Users/danielpaul/package-lock.json`
   makes Next infer the wrong root. Harmless so far. Fix: delete that stray lockfile, or set
   `turbopack.root` in `next.config.ts`.
4. **Owner sign-in required** for `queryDatabase`/`readNote` (privacy). Not signed in = `public` = refused.
5. **Supabase SQL Editor** — paste file **contents**, not the path. Clear the box (⌘A, delete) before pasting.
6. **AI SDK hides errors** as "An error occurred." The chat route now has `onError` +
   `getErrorMessage` logging — check the server log for the real cause.

---

## 11. PENDING — prioritized next steps

### P-now (small, high value)
1. **Run `backfill-structured.mjs`** if not done — fills `meetings`/`people`/`commitments`/`case_studies`
   from synced calls. Verify: ask Danny "when did I last talk to Dana, what did I commit to?"
2. **`vercel.json` manual edits** (file was locked during the session). Add to `crons`:
   ```json
   { "path": "/api/cron/weekly-review", "schedule": "0 17 * * 0" }
   ```
   and to `functions`:
   ```json
   "src/app/api/cron/weekly-review/route.ts": { "maxDuration": 120, "memory": 1024 },
   "src/app/api/brief/pre-call/route.ts": { "maxDuration": 90, "memory": 1024 },
   "src/app/api/draft/generate/route.ts": { "maxDuration": 90, "memory": 1024 },
   "src/app/api/capture/meeting/route.ts": { "maxDuration": 60, "memory": 1024 }
   ```
3. **Draft engine `hooks` query fix** — in `src/app/api/draft/generate/route.ts` the hooks
   query matches `format='linkedin'` but `hooks.format` is the hook *type* (question/contrarian/…),
   so it returns 0. Change to rank by topic match and always return a sample:
   ```sql
   SELECT hook, format, topic FROM hooks
   ORDER BY (CASE WHEN topic ILIKE '%<topic>%' THEN 0 ELSE 1 END), created_at DESC LIMIT 12
   ```

### P1 — Conversational write tools
Let Danny **write** to the structured brain: `logMetric`, `addTask`, `upsertOffer` (set prices!),
`closeCommitment`, `addDecisionRule`. Owner-only. New `src/lib/brain-write-tools.ts` + spread into
the chat route's tools. Closes the read+write loop. (Note: `offers.price` is currently null by design —
this is how you'd fill it: "the workshop is €X" → Danny persists.)

### P2 — 3-part morning brief
Split the single morning brief into **Project Pulse** + **Content Brief** (reads `content_pillars`
+ calendar) + **Intelligence Brief** (24h industry news via Apify/web tools). Three focused skills.

### P3 — Self-maintaining "librarian" (the Ronjo idea)
Nightly agent: reads new/changed vault notes → updates SQL knowledge tables → proposes MASTER.md
edits for approval. The "gets better forever" engine made active.

### P4 — Pre-call auto-trigger (calendar watcher)
`scripts/watch-calendar.mjs` — polls calendar every 15 min, POSTs `{who, meetingTitle}` to
`/api/brief/pre-call` for meetings starting in ~30 min. Add to launchd. (MCP calendar can't run headless.)

### P5 — Finance pipe
Stripe/QuickBooks (both MCPs available) → `revenue_events` + `metrics`. Plus a `/api/metrics/ingest`
endpoint for quantified-self data (Apple Health/Whoop shortcuts → `metrics`).

### P6 — Vercel deploy (was mid-flight)
- Create Vercel Blob store → paste `BLOB_READ_WRITE_TOKEN` into `.env.local`
- `scripts/sync-to-blob.mjs` (referenced, not yet written) to push vault to Blob for prod reads
- Push all env vars: `vercel env add … production`
- Update Supabase Auth → URL Configuration with the Vercel URL
- `vercel deploy --prod` (project already linked: `daniel-pauls-projects-b9d066b6/ai-danny`)
- Then swap `APP_URL` in `.env.local` to the prod URL so local sync scripts hit prod

### P7 — Multi-tenant SaaS shell
Sign-up → per-user vault upload → per-user distillation → Stripe billing → isolation via RLS
(`user_id` is already on every table). `vercel/platforms` is the reference template.

### P-followups
- **`stories` table empty** — repoint `distill-to-sql.mjs` for `stories` + `case_studies` at the
  *full* category bodies (currently only first 900 chars) + `Meetings/`. Re-run `--only=stories --force`.
- **launchd auto-sync** — install `scripts/launchd/com.aidanny.sync.plist` to
  `~/Library/LaunchAgents/` + `launchctl load …` for hands-off 30-min meeting sync.
- **`/insights` + `/session-handoff`** (Nate) — analytics log + handoff memory kind.

---

## 12. File-change log — this session (last 24-48h)

**New migrations:** `0003_briefings.sql`, `0004_structured_brain.sql`, `0005_identity_knowledge.sql`
**New libs:** `agent-tools.ts`, `skill-runner.ts`, `skills.ts`, `structured.ts`, `brain-tools.ts`
**New routes:** `cron/morning-brief`, `cron/weekly-review`, `capture/meeting`, `brief/pre-call`,
`draft/generate`, `briefings/latest`
**New scripts:** `sync-sybill.mjs`, `sync-granola.mjs` (v3 public API), `sync-meetings.mjs`,
`distill-to-sql.mjs`, `backfill-structured.mjs`, `draft-engine.mjs`, `lib/meeting-note.mjs`,
`lib/upsert-capture.mjs`, `launchd/com.aidanny.sync.plist`
**New skills:** `morning-brief.md`, `weekly-review.md`, `pre-call-brief.md`,
`post-meeting-capture.md`, `draft-content.md`
**New component:** `MorningBriefBanner.tsx` (mounted on home, owner-only)
**Edited:** `chat/route.ts` (added `queryDatabase`/`describeBrain`, per-request API key,
error logging), `layout.tsx` (`suppressHydrationWarning`), `vercel.json` (morning-brief cron),
`.env.local` (Supabase, OWNER_EMAIL, CRON_SECRET, SYBILL/GRANOLA keys, APP_URL)

**Data state:** Sybill (7 calls) + Granola (5 notes) synced to `Meetings/`; ~35 commitment
memories captured; **287 rows distilled into 15/17 identity tables**; `queryDatabase` verified
working in chat (Danny pulled the offers table live).

---

## 13. One-command "is everything wired?" check

```bash
cd "/Users/danielpaul/Documents/Second Brain Obsidian App"
./node_modules/.bin/tsc --noEmit        # types clean (ignore pre-existing PresentationGraph/voice warnings)
./node_modules/.bin/next dev --turbopack # then sign in at /login as owner and ask:
#   "what are my active offers?"            → queryDatabase → offers
#   "when did I last talk to Dana?"         → meetings + commitments (after backfill)
#   "write a LinkedIn post on pricing"      → draft engine, in your voice
```
