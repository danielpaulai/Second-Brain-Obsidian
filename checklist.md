# Stage Demo — Build Checklist

Working checklist derived from the Stage Demo Handoff. We take these **one at a time**.
Status legend: `[x]` done · `[~]` partial / stubbed · `[ ]` not started.

> Local boot: `./node_modules/.bin/next dev --turbopack` → http://localhost:3000
> Model: OpenAI `gpt-4o` via `OPENAI_API_KEY` (set in `.env.local`).

---

## 0. Local environment — get it running on this machine

- [x] **Mock Obsidian vault** — real vault is private/absent. `scripts/seed-mock-vault.mjs`
      generates a ~600-node (configurable) deterministically-seeded, richly interlinked
      stand-in at `~/Documents/Obsidian/Mock Vault`: a ~24-note hand-curated spine
      (`_ai-danny/MASTER.md` identity + `_ai-danny/knowledge/` + the demo-script notes) PLUS a
      procedural layer across 15 folders (Meetings, People, Companies, Frameworks, Stories,
      Deals, Content, Offers, ICP, Books, Ideas, Decisions, Principles, Projects). Verified:
      100% of wikilinks resolve, 100% of nodes connected, avg degree ~7, curated notes are the
      top hubs (601 nodes / 2,184 links at default). Re-run with a count arg to scale:
      `node scripts/seed-mock-vault.mjs "<path>" 1500` (stress-tests prod LOD; >1200 = prod path).
- [x] **`VAULT_PATH`** pointed at the mock vault in `.env.local`.
- [x] **Wire OpenAI key** — `AI_MODEL=openai/gpt-4o`. Chat (`/api/chat`), skills (`skill-runner`),
      and drafts (`draft/generate`) all honor the `openai/` prefix. Embeddings auto-fall back to
      `OPENAI_API_KEY` (`src/lib/embeddings.ts`).
- [x] **Verified end-to-end:** OpenAI embeddings (1536-dim) + gpt-4o reachable (HTTP 200);
      `/api/brain/search` returns hybrid keyword+semantic results; LanceDB reindex builds from
      the mock vault; `/api/chat` calls tools and answers in Danny's voice with `[[citations]]`.
- [x] **Dependencies installed** (`node_modules`, 503 pkgs).

### Still off until backends are provisioned (not blocking the visual/chat demo)
- [ ] **Supabase project** — needed for: owner auth/login, `memories` (pgvector), and the
      structured brain (`queryDatabase`/`describeBrain`, 27 tables). Without it the app runs in
      single-user "owner" dev mode; `queryDatabase`, `searchMemories`, and `/login` are inert.
  - [ ] Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`.
  - [ ] Run migrations `supabase/migrations/0001`–`0005`.
  - [ ] Note: memory extraction (`src/lib/memories.ts`) uses **Anthropic Haiku** directly — needs
        `ANTHROPIC_API_KEY` **or** a refactor to OpenAI. Decide before enabling Supabase memory.
- [ ] **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`) — only for prod vault reads; local uses `VAULT_PATH`.
- [ ] **Optional integrations** (only if demoed): Sybill, Granola, Google Calendar, `CRON_SECRET`,
      `NEXT_PUBLIC_TEAM_PASSWORD`.

---

## 1. What already exists (do NOT rebuild — verify only)

- [x] Data layer: `queryBrain` (LanceDB hybrid), `readNote`, `brainStats`, `recentNotes`,
      `listKnowledgeCategories`, `queryKnowledge` — all working against the mock vault.
- [x] 3D `PresentationGraph` (r3f + bloom/DoF/stars, GSAP camera, `useFireCinematic()`).
- [x] 2D `BrainGraph`, `AmbientBrain`, `ThinkingPulse`, `StageDeck`, `CommandPalette`,
      `ChatPanel`, `VoiceInput` (local Whisper), `MorningBriefBanner`.
- [x] 5 agent personas + Danny (`src/lib/agents.ts`); privacy tiers (`src/lib/privacy.ts`).
- [x] Cinematic loop: tool-call → `onBrainQuery` → `fireCinematic` (graph highlight).
- [x] **Smoke-test the visuals** in browser (owner dev mode): toggled Stage, ran a chat query,
      watched the cited nodes ignite; verified live↔stage round-trips and Esc-to-exit.

---

## 2. P0 — Stage Mode UX (biggest gap)

> **Design (this build):** the brain *is* the HUD — a wordless cinematic. CRUCIAL: the stage
> runs through the **same live graph engine** (`BrainGraph` with a `stage` prop), NOT a separate
> canvas — so the woken network has all of BrainGraph's native hover/click/drag/glow/batch-fire.
> A dormant **brain silhouette** → on the spoken cue **"wake up"** → pins release center-out and
> it flows into the live network; voice queries ignite the cited nodes. No question card shown.
> (First attempt used a standalone `StageBrain` canvas — rejected: nodes weren't interactive and
> batch-firing didn't match live. Deleted and rebuilt through `BrainGraph`.)

- [x] **Full-bleed stage** — `src/app/page.tsx` renders `<BrainGraph stage/>` in a
      `fixed inset-0 z-50` overlay when `presentationOn`; HUD, cluster legend, hints, brief, chat
      sidebar, and the live graph are hidden/unmounted behind it. Esc (or ⌘⇧P) exits.
- [x] **Three modes from the dock** — `StageDeck` switches Live (2D `BrainGraph`) / Presentation
      (3D `PresentationGraph`, restored) / Stage. Store: `mode` enum + `setMode` (`on` = mode !== live).
      ⌘⇧P toggles Live↔Stage. HUD/legend show in live+presentation; hidden on stage.
- [x] **`src/lib/brain-shape.ts`** — lays a **subset** (~220 top-degree nodes, not all 600) into a
      coronal-brain silhouette as an even **triangulated mesh** (lattice masked by bilobed cerebrum
      + temporal widening + cerebellum lobes + tapering stem; concavity-spanning edges filtered).
      Sparse/airy like `docs/reference-brain.png`. Replaces the dense random-fill blob.
- [x] **Stage flow inside `BrainGraph`** — dormant: 220 brain nodes pinned in the silhouette +
      decorative mesh; the other ~380 wait hidden (pre-spread, α0). On **"wake up"**: pins release
      center-out, hidden nodes **fade in** (`revealOf`), brain mesh crossfades to wikilinks, the sim
      flows everything into the organic force layout → full ~600-node network (no defined shape).
      Cyan palette + cyan-white lit cores. All stage branches guarded → live unchanged.
- [x] **Theatre slimmed, confetti removed** — `theatre.ts` keeps only `getPresentationSheet()`+`types`
      (`@theatre/core`); the editing Studio (`@theatre/studio`, `TheatreBootstrap`, `PresentationToggle`,
      Choreo/Save) is gone. Stage reply/enter **confetti removed** (`celebrateReply`/`celebrateStageEnter`).
- [x] **Stage palette** — new cyan-dominant bioluminescent ramp on deep navy-black
      (`STAGE_RAMP`/`STAGE_BG`/`STAGE_LIT`/`STAGE_LINK` in `brain-visual.ts`), replacing the
      weaker purple/blue combo. Live graph keeps its calm mono-violet.
- [x] **`presentation-store.ts`** — added `woken` + `wake()`; entering stage resets to dormant.
- [x] **Minimalist voice pill** (Wisprflow-style) shared across both modes (`VoiceDeck`,
      `z-[60]` above the overlay); the user's transcribed "card" is hidden on stage.
- [x] **"wake up" voice command** — `page.tsx` `handleVoice` routes the wake phrase to
      `wake()` (dormant→grow) and everything else to a normal query.
- [ ] Auto-fade idle: after 10s no activity → calmer/dimmer brain. *(not yet — the dormant
      brain already breathes quietly; revisit if the stage feels busy between queries.)*
- [ ] Single-key triggers: bind `1`–`9` to pre-baked scenarios (no modifiers). *(see P3)*

## 3. P1 — "Researching" visualization

- [ ] `src/app/api/chat/route.ts` — enable `experimental_toolCallStreaming`.
- [ ] `src/components/ResearchOverlay.tsx` — in-flight tool-call status (queryBrain searching N
      notes; queryDatabase SQL in mono; searchMemories glyph cards).
- [ ] `PresentationGraph` — `highlightProgressively(ids, staggerMs)` (~60ms) + per-node whoosh.

## 4. P2 — Voice activation (mic-first)

- [x] Push-to-talk on spacebar — `src/components/VoiceDeck.tsx` (hold Space → record, release →
      transcribe + send; mic-level meter; ignores typing). Shared by live + stage.
- [x] STT/TTS wired — STT via **OpenAI `/api/stt` (whisper-1)** server-side (transformers.js
      crashed under Turbopack; local STT deferred — see §13a), TTS via **ElevenLabs
      `eleven_flash_v2_5`** (`/api/tts`); push-to-talk answer is spoken back automatically.
- [~] Minimal pill doubles as the mic UI (no separate `StageMicrophone`/waveform-fullscreen yet).
- [ ] Add `@ricky0123/vad-web`; auto-stop on ~1.2s silence (currently release-to-send).
- [ ] Live transcript surface (Whisper partials). On stage the user card is intentionally hidden.

## 5. P3 — Pre-baked stage scenarios

- [ ] `src/lib/stage-scenarios.ts` — 9 scenarios (key, question, expectedTools, expectedNoteIds, fallbackAnswer).
- [ ] `src/app/api/stage/cache/route.ts` — pre-run all scenarios into a JSON warm cache.
- [ ] Graceful fallback to cached answer (same animation) if a live call fails.
- [ ] Per-scenario intro narration card.

## 6. P4 — Typed answer output (brain, not chatbot)

- [ ] `src/lib/answer-schema.ts` — Zod schema (`principle|story|number|quote|action|warning`).
- [ ] `src/components/answer/{PrincipleCard,StoryCard,NumberCard,ActionCard,QuoteCard}.tsx`.
- [ ] `chat/route.ts` — "stage" mode using `generateObject` instead of `streamText`.
- [ ] Stagger cards in ~200ms apart.

## 7. P5 — Replay mode (recorded queries)

- [ ] Migration `0006_stage_recordings.sql`.
- [ ] `src/app/api/stage/{record,replay}/route.ts`.
- [ ] Replay feeds cached `tool_calls` into `fireCinematic` + streams cached answer (~30 tok/s).

## 8. P6 — Team handoff ("they can borrow your brain too")

- [ ] Polish `src/app/ask/page.tsx` — persona picker + visible redaction chips.
- [ ] `src/app/api/brain/ask/route.ts` — token-auth, rate-limited.
- [ ] `public/embed.js` — 1-line "Borrow Danny" widget.
- [ ] Migration `0007_team_api_keys.sql`.

---

## 9. Polish & hardening (P-late)

- [ ] Persona-switch lighting palette (CFO blue, CMO gold, …) on `agentChange`, <500ms.
- [ ] Sound cues per node; confetti on "done".
- [ ] Rehearsal mode UI — edit scenarios (narration, note IDs, timing) without code.
- [ ] `?clean=1` URL flag — hide all dev-only UI for clean MP4 capture.
- [ ] Typography readable from row 12 (32px+ on 13" laptop).

## 10. Definition of done (stage demo)

- [ ] Press `1` → researching within 1.5s, first answer card within 4s.
- [ ] Spacebar push-to-talk → live transcript → streamed answer.
- [ ] All 9 scenarios run end-to-end; offline cache fallback verified.
- [ ] Stage mode hides all chrome; persona switch obvious within 500ms.
- [ ] Tool-call streaming kills the dead pause; no console errors over a 4-min run.
- [ ] `/ask` shows redaction chips (owner vs team).
- [ ] One real past query replays pixel-perfect from `stage_recordings`.
- [ ] `?clean=1` hides every dev-only element.

---

## Hard rules — don't regress (from §7 of the handoff)

1. Privacy first — never bypass `src/lib/privacy.ts` tiers (owner/team/public).
2. Voice stays local — keep transformers.js Whisper; don't move STT to an API.
3. No fabrication — uncited stage cards must say "Generalizing — not in the brain."
4. Brain viz must be real — only light up nodes that were actually queried.
5. Stage mode needs an offline fallback — never show a red error toast on stage.
6. (When Supabase is on) owner sign-in required for `queryDatabase`/`readNote`.

## Open questions for Danny (decide before building)

- [ ] Push-to-talk vs wake word? *(rec: push-to-talk)*
- [ ] Spoken TTS answers (ElevenLabs) for v1? *(rec: text-only v1)*
- [ ] Stage aspect ratio? *(rec: confirm 16:9)*
- [ ] Per-persona scene colors? *(rec: yes, 5 palettes)*
- [ ] Show live SQL on stage? *(rec: flash ~600ms then collapse to plain English)*
- [ ] Memory extraction model — keep Anthropic Haiku (needs `ANTHROPIC_API_KEY`) or port to OpenAI?
