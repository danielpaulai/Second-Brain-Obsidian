/**
 * seed-mock-vault.mjs — generate a realistic MOCK Obsidian vault for local dev.
 *
 * The real vault (~2,506 notes) is private and not on this machine. This builds
 * a fully-interlinked stand-in so every read-path tool works locally:
 *   queryBrain · brainStats · recentNotes · readNote · listKnowledgeCategories · queryKnowledge
 *
 * It writes a ~24-note hand-curated "spine" (identity + the notes the demo script
 * references) PLUS a large procedurally-generated, deterministically-seeded layer
 * (clients, meetings, frameworks, deals, content…) richly cross-linked via
 * [[wikilinks]] so the graph has real clusters, hubs and bridges for UI/perf testing.
 *
 * It does NOT cover Supabase-backed tools (queryDatabase / searchMemories) —
 * those need a Supabase project + migrations (see checklist.md).
 *
 * Usage:
 *   VAULT_PATH="/Users/you/Documents/Obsidian/Mock Vault" node scripts/seed-mock-vault.mjs
 *   # or pass path + target node count as args (default 600):
 *   node scripts/seed-mock-vault.mjs "/path/to/Mock Vault" 600
 *   node scripts/seed-mock-vault.mjs "/path/to/Mock Vault" 1500   # stress-test prod LOD
 *
 * Deterministic (seeded) — same count → same vault. Safe to re-run (wipes generated/ first).
 */
import fs from "node:fs/promises";
import path from "node:path";

const target =
  process.argv[2] ||
  process.env.VAULT_PATH ||
  path.join(process.env.HOME || ".", "Documents", "Obsidian", "Mock Vault");

const TARGET_COUNT = Math.max(0, Number(process.argv[3] || process.env.VAULT_NODES || 600));

/** note(folder, title, tags[], body) — body may contain [[wikilinks]] and #tags. */
const N = (folder, title, tags, body) => ({ folder, title, tags, body });

const notes = [
  // ── Frameworks (hubs) ─────────────────────────────────────────────
  N("Frameworks", "The Borrowed Brain Thesis", ["thesis", "positioning"],
`The core idea: a second brain isn't note storage — it's *judgment on demand*. Ten years of
calls, decisions, and frameworks, queryable in your own voice.

People don't want more notes. They want **your call** without you in the room. That's the
product. See [[Positioning for B2B Founders]] and the [[Workshop Offer]].

The demo proof: every glowing node is a real note that was actually read. The voice is real
because it's grounded in [[Pricing Philosophy]], [[Objection Handling]], and lived [[Dana Pivot]]
stories — not a generic role-play.`),

  N("Frameworks", "Positioning for B2B Founders", ["positioning", "framework"],
`Position against the *status quo*, not competitors. For B2B founders the status quo is "hire
more people / do it yourself." We sell leverage instead.

The frame: you already have the judgment — we make it queryable and delegable. Tie every claim
to proof. Ground pricing in [[Pricing Philosophy]] and audience in [[ICP - B2B Founders]].
This is the spine of [[The Borrowed Brain Thesis]].`),

  N("Frameworks", "Objection Handling", ["sales", "framework"],
`Objections are requests for proof. Map each one to evidence, not persuasion.

- "Too expensive" → reframe to cost-of-status-quo. See [[Pricing Philosophy]].
- "Will it sound like me?" → show the voice grounded in real notes ([[Dana Pivot]]).
- "We can build this ourselves" → time-to-value math; you can, in 6 months.

Used live in [[2024-04-28 Sales Call - Nordic SaaS]].`),

  // ── Offers / Pricing ──────────────────────────────────────────────
  N("Offers", "Workshop Offer", ["offer", "pricing"],
`The flagship: a 1-day "Borrow My Brain" workshop. Audience is [[ICP - B2B Founders]].
Outcome — a working second-brain query flow + a positioning spine from
[[Positioning for B2B Founders]].

Price set by [[Pricing Philosophy]]. Floor decided in
[[Decision - Workshop Pricing Floor]]. Best proof point: [[The 84k Launch]].`),

  N("Offers", "Pricing Philosophy", ["pricing", "principle"],
`Price the transformation, never the hours. Anchor to the cost of the status quo, then place
the offer well below it but well above "cheap."

Rules:
- Never discount the [[Workshop Offer]] to win a logo.
- The floor exists for a reason — see [[Decision - Workshop Pricing Floor]].
- If three recent deals closed below floor and bled margin, raise the floor.

This is the most-linked note in the brain on money decisions. Cited by [[Objection Handling]]
and [[The 84k Launch]].`),

  // ── ICP ───────────────────────────────────────────────────────────
  N("ICP", "ICP - B2B Founders", ["icp"],
`Bootstrapped or lightly-funded B2B founders, €1–10M revenue, technical or product-led, who are
the bottleneck in their own company. They have judgment but no leverage.

They read [[Positioning for B2B Founders]] and buy the [[Workshop Offer]]. Pain: "everything
routes through me." Desire: clone the judgment, not the person.`),

  // ── People / Accounts ─────────────────────────────────────────────
  N("People", "Dana Reyes", ["person", "client"],
`Founder at [[Acme Corp]]. Sharp, skeptical, allergic to fluff. Our best transformation story —
see [[Dana Pivot]]. Last spoke in [[2024-05-12 Call with Dana]].`),

  N("People", "Acme Corp", ["account", "client"],
`B2B analytics company, ~€4M ARR. Founder is [[Dana Reyes]]. Bought the [[Workshop Offer]] after
the [[Dana Pivot]]. Fits [[ICP - B2B Founders]] perfectly.`),

  N("People", "Nordic SaaS", ["account", "prospect"],
`Mid-market SaaS, Stockholm. Prospect, not yet closed. Main blocker is the "build it ourselves"
objection — handled in [[2024-04-28 Sales Call - Nordic SaaS]] using [[Objection Handling]].`),

  // ── Meetings ──────────────────────────────────────────────────────
  N("Meetings", "2024-05-12 Call with Dana", ["meeting", "call"],
`**Date:** 2024-05-12 · **With:** [[Dana Reyes]] ([[Acme Corp]])

Dana asked whether the second brain would actually sound like her or just "AI mush." Walked her
through grounding answers in real notes — referenced [[Positioning for B2B Founders]] and the
[[Workshop Offer]].

**Commitment I made:** send the workshop proposal with the pricing floor from
[[Pricing Philosophy]] by Friday. This call became the [[Dana Pivot]] story.`),

  N("Meetings", "2024-05-20 Workshop Scoping - Acme", ["meeting", "scoping"],
`**Date:** 2024-05-20 · **With:** [[Acme Corp]]

Scoped the 1-day [[Workshop Offer]]. Agreed on outcomes, locked price at the floor from
[[Decision - Workshop Pricing Floor]]. Tied positioning to [[Positioning for B2B Founders]].`),

  N("Meetings", "2024-04-28 Sales Call - Nordic SaaS", ["meeting", "call", "sales"],
`**Date:** 2024-04-28 · **With:** [[Nordic SaaS]]

Classic "we can build this ourselves." Ran the [[Objection Handling]] playbook — time-to-value
math landed, price did not (yet). Did NOT discount; held the [[Pricing Philosophy]] line.`),

  // ── Stories ───────────────────────────────────────────────────────
  N("Stories", "Dana Pivot", ["story", "proof"],
`[[Dana Reyes]] went from "this is AI mush" to buying the [[Workshop Offer]] in one call —
because the answers were grounded in her own words, not a generic template. The pivot point was
showing real notes lighting up. This is the emotional spine of [[The Borrowed Brain Thesis]].`),

  N("Stories", "The 84k Launch", ["story", "proof", "revenue"],
`The workshop launch that did €84,000 in two weeks. Proof that [[Pricing Philosophy]] holds:
priced the transformation, never discounted, and the [[Workshop Offer]] still sold out.
Referenced in [[Decision - Workshop Pricing Floor]].`),

  // ── Decisions ─────────────────────────────────────────────────────
  N("Decisions", "Decision - Workshop Pricing Floor", ["decision", "pricing"],
`**Decided:** the [[Workshop Offer]] floor is €2,500. **Why:** the last 3 deals below this bled
margin and attracted the wrong [[ICP - B2B Founders]]. Rule from [[Pricing Philosophy]]:
below-floor deals are a no by default. Validated by [[The 84k Launch]].`),

  // ── Principles ────────────────────────────────────────────────────
  N("Principles", "Default to Specific", ["principle", "voice"],
`Vague is the enemy. Every claim gets a number, a name, or a date. "We helped a client" → "[[Dana
Reyes]] at [[Acme Corp]] went from bottleneck to delegated in 30 days." Specificity is the voice.`),

  N("Principles", "Reject AI Slop", ["principle", "voice"],
`No "in today's fast-paced world," no "unlock," no "elevate," no em-dash-stuffed hedging. If a
sentence could've been written by a generic assistant, delete it. The brain sounds like a sharp
operator — see [[Default to Specific]].`),

  // ── Content / Hooks ───────────────────────────────────────────────
  N("Content", "Hook - Borrow My Brain", ["content", "hook"],
`"What if your team could borrow your brain on demand — your voice, your judgment, your context?"
Opens the talk. Pays off [[The Borrowed Brain Thesis]].`),

  N("Content", "Hook - Pricing Floor", ["content", "hook"],
`"I lost money on three deals before I learned to say no below €2,500." Vulnerability + a number.
Grounded in [[Decision - Workshop Pricing Floor]] and [[Pricing Philosophy]].`),
];

// ── _ai-danny identity (MASTER.md) — drives the agent voice ──────────
const MASTER = `---
title: AI Danny — Master Prompt
---

# AI Danny — Operating System

You are AI Danny, a digital version of Daniel Paul. You speak in his voice and hold his
positioning. You are a sharp operator, not an assistant.

## Voice
- Default to short. Long enough to land, short enough to read in 20 seconds.
- Default to specific: a number, a name, or a date in every claim. (See [[Default to Specific]].)
- Reject AI slop. No "unlock," "elevate," "in today's fast-paced world." (See [[Reject AI Slop]].)
- Candid and direct. Push back on busywork. Never sycophantic.

## Positioning
We sell *judgment on demand* — a second brain that gives your call without you in the room.
Position against the status quo ("hire more / do it yourself"), not competitors. Spine:
[[The Borrowed Brain Thesis]] and [[Positioning for B2B Founders]].

## ICP
Bootstrapped/lightly-funded B2B founders, €1–10M, who are the bottleneck in their own company.
Full profile: [[ICP - B2B Founders]].

## Frameworks
- Money: [[Pricing Philosophy]] — price the transformation, never discount to win a logo.
- Sales: [[Objection Handling]] — objections are requests for proof.

## Do not say
- Generic motivational filler. No fabricated stats. If a claim isn't in the brain, say
  "Generalizing — not in the brain" instead of inventing.

Cite vault notes inline as [[Note Title]] whenever you use them.
`;

// ── A small knowledge macro so listKnowledgeCategories / queryKnowledge return real data ──
const KNOWLEDGE = [
  {
    rel: "_ai-danny/knowledge/04-offers-pricing/_README.md",
    body: `---
title: "Offers & Pricing — overview"
---
# Offers & Pricing
How Daniel prices and packages his offers. Source of truth for money decisions.
`,
  },
  {
    rel: "_ai-danny/knowledge/04-offers-pricing/pricing-philosophy.md",
    body: `---
title: "Pricing Philosophy"
slug: pricing-philosophy
status: distilled
lastDistilled: 2024-05-21
description: "How Daniel sets and defends prices."
---
# Pricing Philosophy

<!--::DANNY-DISTILL-START::-->
Price the transformation, never the hours. Anchor to the cost of the status quo, then sit well
below it and well above cheap. The [[Workshop Offer]] floor is €2,500 — below-floor deals are a
no by default. Three sub-floor deals bled margin once; never again. Source: [[Pricing Philosophy]],
[[Decision - Workshop Pricing Floor]], [[The 84k Launch]].
<!--::DANNY-DISTILL-END::-->
`,
  },
  {
    rel: "_ai-danny/knowledge/06-sales/_README.md",
    body: `---
title: "Sales — overview"
---
# Sales
How Daniel runs calls, handles objections, and closes.
`,
  },
  {
    rel: "_ai-danny/knowledge/06-sales/objection-handling.md",
    body: `---
title: "Objection Handling"
slug: objection-handling
status: distilled
lastDistilled: 2024-05-01
description: "Mapping objections to proof."
---
# Objection Handling

<!--::DANNY-DISTILL-START::-->
Objections are requests for proof, not persuasion. "Too expensive" → cost of the status quo.
"Will it sound like me?" → show real notes lighting up ([[Dana Pivot]]). "We can build it
ourselves" → time-to-value math. Never discount to handle an objection. Source:
[[Objection Handling]], [[2024-04-28 Sales Call - Nordic SaaS]].
<!--::DANNY-DISTILL-END::-->
`,
  },
];

function frontmatter(title, tags) {
  const t = tags?.length ? `\ntags: [${tags.join(", ")}]` : "";
  return `---\ntitle: "${title}"${t}\n---\n\n`;
}

async function write(rel, content) {
  const full = path.join(target, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return rel;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Procedural layer — a large, deterministically-seeded, richly cross-linked
 * "second brain" so the graph has real clusters / hubs / bridges for UI testing.
 * Every [[wikilink]] points at a title that exists (generated or curated hub),
 * so edges actually form in the graph.
 * ────────────────────────────────────────────────────────────────────────── */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MANAGED_FOLDERS = [
  "Companies", "People", "Frameworks", "Principles", "Offers", "ICP", "Books",
  "Stories", "Deals", "Meetings", "Content", "Ideas", "Decisions", "Projects", "_ai-danny",
];

function generateProcedural(seedTitles, count) {
  if (count <= 0) return [];
  const rng = mulberry32(20260602);
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const chance = (p) => rng() < p;
  const pickN = (a, n) => {
    const c = a.slice(), o = [];
    n = Math.min(n, c.length);
    for (let i = 0; i < n; i++) o.push(c.splice(Math.floor(rng() * c.length), 1)[0]);
    return o;
  };
  const used = new Set(seedTitles.map((t) => t.toLowerCase()));
  const uniq = (t) => { let s = t, i = 2; while (used.has(s.toLowerCase())) s = `${t} ${i++}`; used.add(s.toLowerCase()); return s; };
  const make = (n, fn) => { const o = []; for (let i = 0; i < n; i++) o.push(uniq(fn(i))); return o; };
  const wl = (t) => (t ? `[[${t}]]` : "");
  const join = (...l) => l.filter(Boolean).join(" · ");

  // Curated spine — link into these so the hand-written notes stay central hubs.
  const HUBS = ["Pricing Philosophy", "Positioning for B2B Founders", "The Borrowed Brain Thesis", "Objection Handling", "ICP - B2B Founders", "Workshop Offer", "Dana Pivot", "The 84k Launch"];

  const first = ["Dana","Marcus","Sofia","Liam","Priya","Noah","Elena","Omar","Chloe","Mateo","Aisha","Kai","Nora","Ravi","Mia","Tomas","Yuki","Hannah","Diego","Lena","Sam","Ivy","Felix","Zara","Owen","Maya","Hugo","Tara","Ben","Aria","Cole","Nina","Jonas","Layla","Ezra","Ada","Theo","Iris","Vera","Leo","Anya","Rhys","Juno","Cyrus","Esme","Soren","Lucia","Arlo","Greta","Otto"];
  const last = ["Reyes","Okafor","Lindqvist","Bauer","Nakamura","Costa","Haddad","Petrov","Sharma","Romano","Andersson","Kim","Dubois","Mensah","Walsh","Novak","Castillo","Berg","Fischer","Holloway","Ibrahim","Vance","Moreau","Larsen","Park","Russo","Singh","Voss","Ortega","Keller","Schmidt","Ahmed","Lowry","Becker","Vidal","Hale","Sato","Marsh","Cohen","Frost","Quinn","Ramos","Stern","Wolf","Bishop","Tan","Engel","Cruz","Beck","Ash"];
  const cAdj = ["North","Bright","Apex","Lumen","Vertex","Cedar","Quartz","Harbor","Atlas","Nova","Pulse","Ember","Slate","Vista","Forge","Helio","Drift","Mosaic","Summit","Tide","Cobalt","Orchard","Beacon","Halcyon","Granite","Aster","Vector","Loom","Cinder","Meridian"];
  const cCore = ["Analytics","Labs","Systems","Logistics","Health","Capital","Robotics","Studio","Cloud","Foods","Mobility","Energy","Security","Retail","Media","Bio","Works","Networks","Dynamics","Ventures","Commerce","Payments","Learning","Fitness","Travel","Audio","Maps","Data","Ops","Care"];
  const industries = ["B2B SaaS","fintech","healthtech","logistics","e-commerce","devtools","creator economy","climate","cybersecurity","martech","proptech","edtech"];
  const fwHead = ["The","A","Daniel's"];
  const fwAdj = ["Asymmetric","Lean","Compounding","Contrarian","First-Principles","Leverage","Founder-Led","Story-Driven","Signal-First","Trust","Velocity","Clarity","Anti-Slop","Borrowed","Proof-First","Demand","Narrative","Outcome","Permissionless","Minimum-Viable"];
  const fwNoun = ["Positioning","Offer","Pricing","Hook","Funnel","Onboarding","Retention","Content","Discovery","Close","Referral","Brand","Launch","Cadence","Audit","Sequence","Loop","Ladder","Moat","Engine"];
  const fwType = ["Framework","Method","System","Playbook","Model","Loop","Stack","Protocol","Lens","Map"];
  const principleSeed = ["Specificity beats polish","Sell the transformation","Show, don't claim","Charge for outcomes","Say no by default","Cut the adjectives","Ship before ready","Cite or stay silent","One promise per page","Proof over persuasion","Voice over volume","Edges over averages","Demos beat decks","Trust compounds","Distribution is the product","Name the enemy","Make it borrowable","Reduce the ask","Earn the next sentence","Energy is a feature","Constraints create voice","Repetition is reputation","Default to short","Own a word","Teach to sell","Receipts win arguments","Friction kills funnels","Clarity is kindness","Boring scales","Niche down to stand out"];
  const bookSeed = ["Obviously Awesome","The Mom Test","Building a StoryBrand","Positioning","$100M Offers","Influence","Made to Stick","The 22 Immutable Laws","Hooked","Deep Work","Show Your Work","This Is Marketing","The Brain Audit","Expert Secrets","Purple Cow","Atomic Habits","The Cold Start Problem","Crossing the Chasm","Play Bigger","Win Without Pitching"];
  const contentType = ["Hook","Thread","Post","Essay","Newsletter","Carousel","Talk","Script"];
  const meetingType = ["Discovery Call","Sales Call","Workshop Scoping","Strategy Session","Check-in","Kickoff","Renewal Call","Review","Intro Call","Coaching Call"];
  const dealStage = ["intent","call booked","proposal sent","negotiation","closed-won","closed-lost"];
  const ideaSeed = ["a teardown series","a productized audit","a cohort program","a free diagnostic tool","a referral loop","a swipe-file lead magnet","a live build stream","a partner bundle","a voice-of-customer report","a pricing experiment","a community space","a templated workshop","a case-study engine","an annual report play","a waitlist launch","a podcast tour","a guarantee redesign","a niche landing page","a win-back sequence","a repurposing system"];
  const decisionSeed = ["raise the workshop floor","drop the lowest tier","niche down to B2B founders","kill the discovery discount","add a results guarantee","move to value-based pricing","cap clients per quarter","require a paid trial","standardize the close script","retire the legacy offer"];
  const projectSeed = ["Q3 Launch","Brand Refresh","Sales Playbook v2","Workshop Productization","Content Engine","Referral Program","Pricing Overhaul","Onboarding Redesign","Case-Study Sprint","Website Rebuild"];
  const tagPool = ["client","sales","content","framework","pricing","offer","positioning","meeting","story","decision","idea","principle","b2b","founder","growth","brand","funnel","retention","launch","voice"];
  const tags = () => pickN(tagPool, int(2, 4));

  // Scale base counts to ~`count` total generated notes.
  const base = { companies: 45, people: 90, frameworks: 55, principles: 35, offers: 14, icps: 8, books: 28, stories: 45, deals: 45, meetings: 130, content: 70, ideas: 40, decisions: 30, projects: 18 };
  const baseSum = Object.values(base).reduce((a, b) => a + b, 0);
  const sc = count / baseSum;
  const C = {};
  for (const k in base) C[k] = Math.max(3, Math.round(base[k] * sc));

  const companies = make(C.companies, () => `${pick(cAdj)} ${pick(cCore)}`);
  const people = make(C.people, () => `${pick(first)} ${pick(last)}`);
  const frameworks = make(C.frameworks, () => `${pick(fwHead)} ${pick(fwAdj)} ${pick(fwNoun)} ${pick(fwType)}`);
  const principles = make(C.principles, (i) => principleSeed[i % principleSeed.length]);
  const offers = make(C.offers, (i) => ["Workshop","Intensive","Audit","Sprint","Retainer","Mastermind","Teardown","Bootcamp","Clinic","Accelerator","Diagnostic","Cohort","Advisory","Toolkit"][i % 14] + " Offer");
  const icps = make(C.icps, (i) => `ICP - ${["Bootstrapped Founders","Funded Startups","Agency Owners","Solo Consultants","Creator-Operators","Dev Tool Founders","E-com Brands","Fintech Teams"][i % 8]}`);
  const books = make(C.books, (i) => bookSeed[i % bookSeed.length]);
  const stories = make(C.stories, () => `${pick(first)} ${pick(["Pivot","Turnaround","Breakthrough","Save","Win","Comeback","Launch","Close"])}`);
  const deals = make(C.deals, () => `Deal — ${pick(companies)}`);
  const meetings = make(C.meetings, () => `${pick([2023, 2024])}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")} ${pick(meetingType)} - ${pick(companies)}`);
  const content = make(C.content, () => `${pick(contentType)} — ${pick(fwAdj)} ${pick(fwNoun)}`);
  const ideas = make(C.ideas, (i) => `Idea — ${ideaSeed[i % ideaSeed.length]}`);
  const decisions = make(C.decisions, (i) => `Decision - ${decisionSeed[i % decisionSeed.length]}`);
  const projects = make(C.projects, (i) => `Project — ${projectSeed[i % projectSeed.length]}`);
  const allIcp = [...icps, "ICP - B2B Founders"];

  const out = [];
  const add = (folder, title, body) => out.push({ folder, title, tags: tags(), body });

  for (const t of companies) add("Companies", t, `${pick(industries)} company. Open ${wl(pick(deals))}. Fits ${wl(pick(allIcp))}.\n\nContacts: ${join(wl(pick(people)), wl(pick(people)))}.`);
  for (const t of people) add("People", t, `Contact at ${wl(pick(companies))}. ${chance(0.5) ? "Client" : "Prospect"}. Met in ${wl(pick(meetings))}.\n\nThreads tie back to ${join(wl(pick(frameworks)), wl(pick(HUBS)))}.`);
  for (const t of frameworks) add("Frameworks", t, `${pick(["A way to","How to","The lens for"])} ${pick(fwNoun).toLowerCase()} that compounds. Builds on ${wl(pick(HUBS))} and ${wl(pick(frameworks))}.\n\nGrounded in ${join(wl(pick(principles)), wl(pick(allIcp)))}.`);
  for (const t of principles) add("Principles", t, `${t}. A rule that shapes the work — see ${wl(pick(frameworks))} and ${wl(pick(HUBS))}.`);
  for (const t of offers) add("Offers", t, `An offer for ${wl(pick(allIcp))}. Priced via ${wl("Pricing Philosophy")}. Proof: ${wl(pick(stories))}.\n\nSold through ${join(wl(pick(frameworks)), wl("Objection Handling"))}.`);
  for (const t of icps) add("ICP", t, `${t.replace("ICP - ", "")} — who we serve. Reached via ${wl(pick(frameworks))}; converted with ${wl(pick(offers))}.`);
  for (const t of books) add("Books", t, `Highlights from ${t}. Reinforces ${join(wl(pick(principles)), wl(pick(frameworks)))}.`);
  for (const t of stories) add("Stories", t, `A client transformation — ${wl(pick(people))} at ${wl(pick(companies))}. Proof for ${join(wl(pick(offers)), wl(pick(HUBS)))}.`);
  for (const t of deals) add("Deals", t, `Stage: ${pick(dealStage)}. Offer: ${wl(pick(offers))}. Champions: ${join(wl(pick(people)), wl(pick(people)))}.`);
  for (const t of meetings) add("Meetings", t, `**With:** ${wl(pick(people))} (${wl(pick(companies))}).\n\nDiscussed ${join(wl(pick(frameworks)), wl(pick(offers)))}. Ties to ${wl(pick(HUBS))}.`);
  for (const t of content) { const p = t.split(" — "); add("Content", t, `${p[0]} on ${p[1] || "positioning"}. Built from ${join(wl(pick(frameworks)), wl(pick(stories)))}. CTA → ${wl(pick(offers))}.`); }
  for (const t of ideas) add("Ideas", t, `${t.replace("Idea — ", "")}. Test against ${wl(pick(frameworks))}; gate with ${wl(pick(principles))}.`);
  for (const t of decisions) add("Decisions", t, `Decided to ${t.replace("Decision - ", "")}. Rationale from ${join(wl("Pricing Philosophy"), wl(pick(frameworks)))}. Validated by ${wl(pick(stories))}.`);
  for (const t of projects) add("Projects", t, `Initiative spanning ${join(wl(pick(deals)), wl(pick(offers)))}. Owner: ${wl(pick(people))}. Anchored on ${wl(pick(HUBS))}.`);

  return out;
}

async function main() {
  await fs.mkdir(target, { recursive: true });
  // Clean previously-generated content (scoped to the folders this script manages).
  for (const f of MANAGED_FOLDERS) await fs.rm(path.join(target, f), { recursive: true, force: true });

  const written = [];

  // 1) Hand-curated spine (identity + the notes the demo script references).
  for (const n of notes) {
    const rel = path.join(n.folder, `${n.title}.md`);
    written.push(await write(rel, frontmatter(n.title, n.tags) + n.body + "\n"));
  }
  written.push(await write("_ai-danny/MASTER.md", MASTER));
  for (const k of KNOWLEDGE) written.push(await write(k.rel, k.body));

  // 2) Procedural bulk — fill up to TARGET_COUNT total notes.
  const seedTitles = notes.map((n) => n.title).concat("MASTER", "_README", "pricing-philosophy", "objection-handling");
  const gen = generateProcedural(seedTitles, TARGET_COUNT - written.length);
  for (const g of gen) {
    written.push(await write(path.join(g.folder, `${g.title}.md`), frontmatter(g.title, g.tags) + g.body + "\n"));
  }

  // A tiny .obsidian marker so Obsidian recognizes it as a vault (excluded by app).
  await write(".obsidian/app.json", "{}\n");

  const folders = [...new Set(written.map((r) => r.split(path.sep)[0]))].sort();
  console.log(`✓ Mock vault written to: ${target}`);
  console.log(`  ${written.length} notes total (${notes.length + 1 + KNOWLEDGE.length} curated + ${gen.length} generated), target ${TARGET_COUNT}`);
  console.log(`  Folders (${folders.length}): ${folders.join(", ")}`);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
