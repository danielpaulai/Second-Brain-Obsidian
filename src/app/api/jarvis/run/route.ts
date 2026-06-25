import { generateObject, generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { anthropicFetch } from "@/lib/anthropic-fetch";
import { readBusinessDoc, defaultClient } from "@/lib/client-knowledge";
import {
  keywordRoute,
  node,
  leavesOf,
  isFormat,
  SHARED_SPECIALISTS,
  ROUTER_OPTIONS,
  type TeamPlan,
} from "@/lib/org";
import {
  encodeEvent,
  type CarouselArtifactData,
  type LeadsArtifactData,
  type NewsletterArtifactData,
  type LeadRow,
  type RouteAssignment,
  type JarvisEvent,
  type JarvisNodeId,
} from "@/lib/jarvis-events";
import { CORE_BLOCK_GRAMMAR } from "@/lib/block-grammar";
import { scrapeLinkedInLeads, MAX_LEADS } from "@/lib/lead-scraper";
import { enrichLeads, type EnrichedLead } from "@/lib/lead-enrichment";
import { leadsTestMode } from "@/lib/lead-fixtures";
import { NO_EMDASH_RULE, deDash, stripEmDashes } from "@/lib/sanitize";
import { runWebSearch } from "@/lib/research-tools";
import { searchVault, readVaultNote } from "@/lib/brain-vault";
import { getBrandKit } from "@/lib/brand-kit";
import { generateImage, imageModelConfigured } from "@/lib/openai-image";
import { buildNewsletterHtml, type NewsletterContent } from "@/lib/newsletter";
import { getContentGuide } from "@/lib/content-guides";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Pulse mission-control run. ONE instruction in, a live NDJSON event stream out.
 *
 * Real routing under the hood: KRONOS (an Opus 4.8 call) reads the intent and
 * picks a department + ordered specialists; the specialists do real work
 * (reading the founder's actual ICP / voice docs and generating the deliverable).
 * The pacing is theatrical — each phase dwells a beat so the dashboard animation
 * has room to breathe and the run never looks janky on stage. If the model is
 * unavailable, every phase degrades to grounded fallback content so a demo run
 * always completes.
 */

function model() {
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    fetch: anthropicFetch,
  });
  return anthropic("claude-opus-4-8");
}

const beat = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* --------------------------- KRONOS routing --------------------------- */

const DEPT_IDS = ["cmo", "coo", "cto", "cro"] as const;
const LEAF_IDS = [
  "research",
  "text",
  "picture",
  "carousel",
  "reels",
  "longform",
  "newsletter",
  "leads",
  "webpages",
  "ops",
] as const;

const AssignmentSchema = z.object({
  department: z.enum(DEPT_IDS),
  specialists: z.array(z.enum(LEAF_IDS)).describe("This department's producing leaves, in execution order."),
});

const RouteSchema = z.object({
  rationale: z.string().describe("One sentence: how you're splitting this across the team, in plain language."),
  assignments: z
    .array(AssignmentSchema)
    .min(1)
    .max(4)
    .describe("One entry per department that should work on this. Assign SEVERAL for open-ended requests."),
});

async function routeWithKronos(instruction: string): Promise<TeamPlan> {
  const fallback = keywordRoute(instruction);
  try {
    const { object } = await generateObject({
      model: model(),
      schema: RouteSchema,
      maxRetries: 1,
      system:
        "You are the AI CEO of the founder's company. You read ONE instruction and delegate it to the RIGHT department head(s), who each fire their own specialist sub-agents. You never do the work yourself. Match every employee to what they're actually best at — delegate accordingly, never lazily.\n\n" +
        "Departments and what each PRODUCES:\n" +
        ROUTER_OPTIONS.departments
          .map((d) => `- ${d.id.toUpperCase()} (${d.label}) produces: ${d.produces.join(", ")}`)
          .join("\n") +
        "\n\nShared specialists (available to EVERY department): " +
        ROUTER_OPTIONS.shared.map((s) => `${s.id} (${s.label})`).join(", ") +
        ".\n\nDelegation principles:\n" +
        "- For a focused, single-craft request, assign ONE department and the SINGLE most-fitting specialist (e.g. a carousel → cmo:[carousel]; a cold list → cro:[leads]).\n" +
        "- For an OPEN-ENDED or multi-part request (e.g. 'launch my new offer', 'grow my pipeline this month'), assign EVERY department that genuinely contributes — they run in PARALLEL as a team — and give each the specific specialist(s) that do its part.\n" +
        "- A department can run SEVERAL of its own specialists when the job has several parts (e.g. cmo:[carousel, text] for a deck plus the post that ships it).\n" +
        "- Pick the format that fits the ask: text post → text, single graphic → picture, swipe deck → carousel, short video → reels, long video/VSL → longform. Do NOT default to carousel.\n" +
        "- CHEATSHEETS (listicles, vs/comparison, do's-and-don'ts) are produced as carousels → use the carousel specialist; the writer pulls the right cheatsheet playbook by the task.\n" +
        "- Research is shared: include it whenever a market / audience / angle read sharpens the work (almost always true for content and outbound) — it runs ONCE first and feeds the whole team. Skip it only for a purely mechanical ask.\n" +
        "- A department's specialists must be the producing leaves it actually owns; never invent work a department can't do, and never assign a department nothing to do.\n\n" +
        "Worked examples:\n" +
        '- "build me a carousel about retention" → [{cmo:[research, carousel]}]\n' +
        '- "find me 50 fintech founders with emails" → [{cro:[leads]}]\n' +
        '- "write a reel script and the post to caption it" → [{cmo:[research, reels, text]}]\n' +
        '- "launch my new offer this month" → [{cmo:[research, carousel, text]}, {cro:[leads]}, {cto:[webpages]}, {coo:[ops]}]',
      prompt: `Instruction: "${instruction}"`,
    });

    // sanitize: per-department keep its OWNED leaves; pull shared specialists out
    // to run once; merge duplicate departments.
    const sharedSet = new Set<JarvisNodeId>();
    const byDept = new Map<JarvisNodeId, JarvisNodeId[]>();
    for (const a of object.assignments) {
      const owned = new Set<JarvisNodeId>(leavesOf(a.department));
      for (const s of a.specialists) {
        if (SHARED_SPECIALISTS.includes(s)) {
          sharedSet.add(s);
          continue;
        }
        if (owned.has(s)) {
          const cur = byDept.get(a.department) ?? [];
          if (!cur.includes(s)) cur.push(s);
          byDept.set(a.department, cur);
        }
      }
      // a department with no valid specialists falls back to its default leaf
      if (!byDept.get(a.department)?.length) {
        const fb =
          fallback.assignments.find((x) => x.department === a.department)?.plan ??
          leavesOf(a.department).slice(0, 1);
        byDept.set(a.department, fb);
      }
    }

    const assignments: RouteAssignment[] = Array.from(byDept.entries()).map(([department, plan]) => ({
      department,
      plan,
    }));
    if (assignments.length === 0) return fallback;
    return { assignments, shared: Array.from(sharedSet), rationale: object.rationale };
  } catch {
    return fallback;
  }
}

/* --------------------------- specialist work --------------------------- */

type Emit = (e: JarvisEvent) => void;
const now = () => Date.now();

async function readDoc(docType: string, node: JarvisNodeId, emit: Emit, grounding: string[]) {
  const doc = await readBusinessDoc({ docType: docType as never });
  if (doc.found) {
    grounding.push(doc.title);
    emit({ type: "agent.tool", node, tool: "readBusinessDoc", detail: doc.title, at: now() });
    await beat(420);
  }
  return doc;
}

/** Research specialist (SHARED): read the ICP/positioning, produce a sharp angle
 *  brief, and report up to whichever department head fired it. */
async function runResearch(
  instruction: string,
  reportTo: JarvisNodeId,
  emit: Emit,
  grounding: string[]
): Promise<string> {
  emit({ type: "agent.activate", node: "research", label: node("research").label, at: now() });
  await beat(500);
  emit({ type: "agent.status", node: "research", status: "Reading your ICP and positioning", at: now() });

  const ruleOfOne = await readDoc("rule-of-one", "research", emit, grounding);
  const icp = await readDoc("icp-profile", "research", emit, grounding);
  const messaging = await readDoc("messaging-house", "research", emit, grounding);

  const docContext = [ruleOfOne, icp, messaging]
    .filter((d) => d.found)
    .map((d) => `## ${d.title}\n${d.body.slice(0, 2200)}`)
    .join("\n\n");

  // Search the founder's WHOLE second brain — the uploaded Obsidian vault stored
  // in Supabase pgvector. This is everything they've ever written, not just the
  // curated GTM docs, so the angle is grounded in their real thinking.
  emit({ type: "agent.status", node: "research", status: "Searching your second brain", at: now() });
  let vaultContext = "";
  try {
    const hits = await searchVault(instruction, { limit: 6, groupByDocument: true });
    if (hits.length) {
      emit({ type: "agent.tool", node: "research", tool: "Second Brain", detail: `${hits.length} notes from your vault`, at: now() });
      grounding.push("your second brain");
      vaultContext = hits.map((h) => `- ${h.title} [${h.folder}]: ${h.content.replace(/\s+/g, " ").slice(0, 360)}`).join("\n");
      await beat(340);
    }
  } catch {
    /* vault optional — degrades cleanly when nothing's been uploaded yet */
  }

  // Live trend search (real when TAVILY_API_KEY is set; otherwise reason from positioning)
  emit({ type: "agent.status", node: "research", status: "Scanning live discussions", at: now() });
  let liveContext = "";
  try {
    const search = await runWebSearch(instruction, "linkedin", 6);
    if (search.configured && search.results?.length) {
      emit({ type: "agent.tool", node: "research", tool: "webSearch", detail: `${search.results.length} live results on LinkedIn`, at: now() });
      grounding.push("live web search");
      liveContext = search.results.map((r) => `- ${r.title}: ${r.snippet}`).join("\n");
      await beat(360);
    }
  } catch {
    /* search optional — fall back to positioning */
  }

  emit({ type: "agent.status", node: "research", status: "Finding the sharpest angle", at: now() });

  let brief =
    "Angle: lead with one concrete result the avatar wants, framed against the belief that's holding them back.";
  try {
    const { text } = await generateText({
      model: model(),
      maxTokens: 600,
      system:
        "You are the founder's Research specialist — a SHARED specialist feeding the whole team. Given the founder's real positioning docs, notes pulled from their SECOND BRAIN (their own vault), any LIVE search results, and a request, produce a TIGHT creative brief for the producing specialists: the single sharpest angle, the avatar's core want and fear it speaks to, and 3 specific talking points grounded in the founder's proof. Prefer the founder's OWN words and ideas from their vault notes when they're relevant. When live results are present, anchor the trend in what is actually being said. No fluff, no preamble. 130 words max.",
      prompt:
        `Request: "${instruction}"\n\nFounder docs:\n${docContext || "(none available — reason from a high-trust B2B founder positioning)"}` +
        (vaultContext ? `\n\nFrom the founder's second brain (their own notes):\n${vaultContext}` : "") +
        (liveContext ? `\n\nLive discussions right now:\n${liveContext}` : ""),
    });
    if (text.trim()) brief = stripEmDashes(text.trim());
  } catch {
    /* keep fallback brief */
  }

  emit({ type: "agent.status", node: "research", status: "Angle locked", at: now() });
  await beat(350);
  // first meaningful line, stripped of markdown header/label noise for the feed
  const firstLine =
    brief
      .split("\n")
      .map((l) => l.replace(/^[#*\->\s]+/, "").replace(/^(creative brief|angle)[:\s-]*/i, "").trim())
      .find((l) => l.length > 8)
      ?.slice(0, 120) ?? "Angle locked";
  emit({ type: "agent.output", node: "research", summary: firstLine, at: now() });
  await beat(300);
  emit({ type: "agent.report", from: "research", to: reportTo, summary: "Angle + talking points delivered", at: now() });
  await beat(450);
  return brief;
}

const NUM_WORDS: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** How many slides the founder asked for. Default 5, clamped to 3-10. */
function parseSlideCount(instruction: string, def = 5): number {
  const t = instruction.toLowerCase();
  let n =
    Number((t.match(/(\d{1,2})\s*-?\s*slide/) || [])[1]) ||
    Number((t.match(/carousel\s+(?:of|with|in)\s+(\d{1,2})/) || [])[1]) ||
    NUM_WORDS[(t.match(/\b(three|four|five|six|seven|eight|nine|ten)\b\s+slide/) || [])[1]] ||
    0;
  if (!n) return def;
  return Math.max(3, Math.min(10, Math.round(n)));
}

function buildSlideSchema(slideCount: number) {
  return z.object({
  topic: z.string().describe("The carousel's subject in 3-6 words."),
  hook: z.string().describe("The scroll-stopping first-slide line."),
  styleBible: z
    .string()
    .describe(
      "ONE concrete paragraph defining the SHARED visual template for every slide: layout, typography style, color palette (name the actual colors), spacing, and mood. Specific enough to recreate the identical look across all the slides."
    ),
  slides: z
    .array(
      z.object({
        kind: z.enum(["hook", "body", "cta"]),
        layout: z
          .enum(["split", "stacked", "statement"])
          .describe(
            "This slide's layout. split = headline + body on ONE side, the main visual on the OTHER side. stacked = heading (with its icon/logo) at the TOP, full-width body text below it, then the main visual element UNDERNEATH (3 clean bands). statement = a bold mostly-text slide, only a subtle/edge visual. (The cover & closing slides are rendered separately as a hero with the founder's photo — pick layouts for the MIDDLE slides.)"
          ),
        title: z.string().describe("3-6 word slide headline. If the slide is about a specific tool/brand, NAME it (e.g. 'FOR WRITING: USE CLAUDE')."),
        body: z.string().describe("1-2 punchy sentences. No hashtags."),
        logos: z
          .array(z.string())
          .describe("Official brand/product/tool names whose REAL logos should appear on this slide (e.g. 'Notion', 'Perplexity', 'Lovable'). Use [] when none apply."),
        visual: z
          .string()
          .describe(
            "Concrete description of this slide's MAIN visual element(s): which official logos to show (in clean white rounded cards) and/or which product UI to show as a realistic screenshot in a subtle device mockup. Be specific and REAL — never abstract/conceptual art, never random stock imagery."
          ),
      })
    )
    .length(slideCount),
  caption: z.string().describe("The LinkedIn caption to post with the carousel. No hashtag spam."),
  });
}

/** Carousel specialist: match voice, write 5 slides, then render real visuals. */
async function runCarousel(
  instruction: string,
  brief: string,
  emit: Emit,
  grounding: string[]
): Promise<CarouselArtifactData> {
  const slideCount = parseSlideCount(instruction); // founder can ask for "an 8-slide carousel" etc.
  emit({ type: "agent.activate", node: "carousel", label: node("carousel").label, at: now() });
  await beat(500);
  emit({ type: "agent.status", node: "carousel", status: "Matching your voice", at: now() });

  const voice = await readDoc("voice-dna", "carousel", emit, grounding);

  // Pull the matching MASTER PROMPT from the founder's content playbook (the
  // carousel prompt, or the right cheatsheet variant, chosen by the task) and let
  // it drive the writing — retrieved IN FULL.
  const guide = await getContentGuide({ format: "carousel", task: `${instruction}\n\n${brief}` });
  if (guide) {
    grounding.push(`content guide: ${guide.title}`);
    emit({ type: "agent.tool", node: "carousel", tool: "Content guide", detail: guide.title, at: now() });
    await beat(300);
  }
  emit({ type: "agent.status", node: "carousel", status: guide ? `Writing to “${guide.title}”` : `Writing ${slideCount} slides`, at: now() });

  let data: CarouselArtifactData = {
    topic: "Your edge, made simple",
    hook: "Most founders are one clear story away from being undeniable.",
    slides: [
      { n: 1, kind: "hook", title: "The wrong fix", body: "You don't need more tactics. You need one sharp story." },
      { n: 2, kind: "body", title: "What they feel", body: "Your buyer is drowning in noise and quietly doubting their plan." },
      { n: 3, kind: "body", title: "The shift", body: "Name the belief that's costing them, then show the proof." },
      { n: 4, kind: "body", title: "The proof", body: "Use a real result, not a promise. Specific beats clever." },
      { n: 5, kind: "cta", title: "Your move", body: "Pick one belief to challenge this week. Post it. Repeat." },
    ],
    caption: "Most founders are one clear story away from being undeniable. Here's the shift.",
    grounding,
  };
  try {
    const { object: rawObject } = await generateObject({
      model: model(),
      schema: buildSlideSchema(slideCount),
      maxTokens: 2000,
      maxRetries: 1,
      system:
        "You are Danny's Carousel specialist." +
        (guide
          ? `\n\nFollow this MASTER CONTENT GUIDE exactly — it is the authoritative playbook for this format. Apply its hook formulas, structure, formatting, and rules:\n\n${guide.body}\n\n---\n`
          : "") +
        `\n\nProduce a ${slideCount}-slide LinkedIn carousel (EXACTLY ${slideCount} slides) in Danny's EXACT voice (match the loaded Voice DNA markers, rhythm, and vocabulary). Arc: slide 1 is the hook (kind "hook"), the middle slides build (kind "body"), and the LAST slide is the CTA (kind "cta"). Short, punchy, no hashtag spam, no corporate filler. Ground every claim in the brief; never invent metrics.\n\nAlso act as ART DIRECTOR for EACH slide: choose its layout (split / stacked / statement) and the CONCRETE visual elements. Name the SPECIFIC official tools/brands to feature as their REAL logos, and the product UIs to show as realistic screenshots, preferring real recognizable logos and interfaces over abstract or conceptual art. When a slide is about a tool, name it in the headline and feature its official logo. Vary the layouts across the middle slides so the deck isn't monotonous. DEVICE RULE for the \`visual\`: when it's a product screenshot/UI, a SPLIT slide shows it on a MOBILE PHONE (half width) and a STACKED slide shows it in a DESKTOP BROWSER / laptop window (full width), describe it that way. Keep the founder's header + branding identical on every slide.\n\n` +
        NO_EMDASH_RULE,
      prompt:
        `Request: "${instruction}"\n\n` +
        `Creative brief from Research:\n${brief}\n\n` +
        (voice.found ? `Voice DNA:\n${voice.body.slice(0, 2400)}` : "Voice DNA unavailable — write in a confident, direct founder voice."),
    });
    const object = deDash(rawObject); // scrub any em-dashes before they hit slides / image prompts
    data = {
      topic: object.topic,
      hook: object.hook,
      slides: object.slides.map((s, i) => ({
        n: i + 1,
        kind: s.kind,
        title: s.title,
        body: s.body,
        layout: s.layout,
        visual: s.visual,
        logos: s.logos,
      })),
      caption: object.caption,
      grounding,
      styleBible: object.styleBible,
    };
  } catch {
    /* keep grounded fallback */
  }

  emit({ type: "agent.status", node: "carousel", status: "Deck ready", at: now() });
  await beat(300);
  emit({ type: "agent.output", node: "carousel", summary: `${data.slides.length} slides on "${data.topic}"`, at: now() });
  await beat(200);

  // Image generation now runs CLIENT-SIDE — each slide is rendered by the browser
  // via POST /api/carousel/image (with per-image retries), so a large deck never
  // hits the serverless timeout and we NEVER fall back to a text/HTML deck. We emit
  // the written deck carrying each slide's prompt metadata; CarouselArtifact renders
  // the gpt-image visuals and retries any that fail.
  emit({ type: "agent.status", node: "carousel", status: "Deck ready · rendering visuals", at: now() });
  emit({ type: "artifact", kind: "carousel", data, at: now() });
  await beat(200);

  emit({ type: "agent.report", from: "carousel", to: "content", summary: "Carousel delivered", at: now() });
  await beat(450);
  return data;
}

/* --------------------------- newsletter --------------------------- */

const NewsletterSchema = z.object({
  kicker: z.string().describe("a short eyebrow label shown above the title, e.g. 'The Founder's Note' or 'Weekly note'"),
  subject: z.string().describe("the email subject line — specific, benefit- or curiosity-driven, never clickbait"),
  preview: z.string().describe("inbox preview text (~60-90 chars) that complements the subject"),
  title: z.string().describe("the headline shown at the top of the email body — short and punchy"),
  intro: z.string().describe("a personal opening, 2-3 SHORT paragraphs (blank line between each), written to ONE reader in Danny's voice"),
  sections: z
    .array(
      z.object({
        heading: z.string().describe("3-7 word section heading"),
        body: z
          .string()
          .describe(
            "1-3 short paragraphs. Use Markdown structure where it genuinely helps readability: '- ' at line start for a bullet list, '### ' for a subheading, and **bold** for key phrases. Do not over-format."
          ),
      })
    )
    .min(2)
    .max(4),
  quote: z.string().nullable().describe("ONE short, punchy pull-quote (a single memorable sentence) to feature centered, or null if none fits"),
  cta: z.object({ label: z.string().describe("a VERY short button label — 2-4 words, max ~24 characters — so it fits on ONE line in the button, e.g. 'Reply and tell me'"), url: z.string().describe("a real URL, or '#' if none was given") }),
  signoff: z.string().describe("the sign-off line, e.g. '— Daniel'"),
  heroPrompt: z
    .string()
    .describe(
      "a SPECIFIC, thought-out visual CONCEPT for the hero illustration that captures THIS issue's core idea. Name the literal subject/objects in the frame AND the metaphor they convey — e.g. for 'stand out', 'a single warm-lit lighthouse rising above a calm sea of identical small gray boats'. A concrete designed scene, never a vague mood or generic office/business stock."
    ),
  inlinePrompt: z
    .string()
    .nullable()
    .describe("an optional SECOND concept — a smaller supporting illustration tied to one specific section, described just as concretely as the hero — or null for none"),
});

/** Art-direct a PURPOSE-BUILT premium editorial illustration (not generic stock /
 *  "AI photo" filler). `desc` is the content-specific concept the writer chose. */
const newsletterImagePrompt = (desc: string, accent: string) =>
  `A premium, purpose-built editorial illustration for a founder's newsletter — ONE strong, intentional idea, designed by a top brand studio, NOT a generic stock image.\n` +
  `CONCEPT (what is literally in the frame, and the idea it conveys): ${desc}.\n` +
  `STYLE: modern editorial vector illustration with subtle dimensional shading and a fine paper grain; bold, simple, confident shapes; ONE clear focal subject; deliberate composition with generous negative space and intentional use of scale.\n` +
  `PALETTE: warm off-white / cream background, soft warm neutrals, and ${accent} crimson as the SINGLE bold accent. Light, airy, high-key, calm, expensive.\n` +
  `STRICTLY AVOID: photographic stock look, corporate clip-art, smiling business people, hands pointing at floating charts, glossy 3D chrome spheres, random gradient blobs, neon, lens flares, busy clutter — and absolutely NO text, words, letters, numbers, logos, watermarks, or fake UI.`;

/**
 * Newsletter specialist: plan + write the issue from the founder's OWN newsletter
 * playbook (vault note), render up to TWO light-themed image assets via gpt-image,
 * fill the brand-DNA HTML template, and deliver it to the response box.
 */
async function runNewsletter(
  instruction: string,
  brief: string,
  emit: Emit,
  grounding: string[]
): Promise<NewsletterArtifactData> {
  emit({ type: "agent.activate", node: "newsletter", label: node("newsletter").label, at: now() });
  await beat(420);
  emit({ type: "agent.status", node: "newsletter", status: "Matching your voice", at: now() });
  const voice = await readDoc("voice-dna", "newsletter", emit, grounding);

  // The newsletter playbook lives in the founder's second brain (vault note).
  emit({ type: "agent.status", node: "newsletter", status: "Reading your newsletter playbook", at: now() });
  const guide = await readVaultNote("newsletter-structure");
  if (guide.found) {
    grounding.push("vault: newsletter-structure");
    emit({ type: "agent.tool", node: "newsletter", tool: "Second Brain", detail: "newsletter-structure", at: now() });
    await beat(220);
  }

  emit({ type: "agent.status", node: "newsletter", status: "Planning the issue", at: now() });

  // grounded fallback so the run always delivers a real newsletter
  let content: NewsletterContent = {
    kicker: "The Founder's Note",
    subject: "The one change that fills your pipeline",
    preview: "Stop writing for the algorithm. Start writing for one person.",
    title: "Stop writing for the algorithm",
    intro:
      "Quick one this week.\n\nMost founders treat their newsletter like a LinkedIn post with a subject line. That is the mistake. The newsletter is a private conversation at scale, not a broadcast.",
    sections: [
      { heading: "The shift", body: "Write to one person who paid to hear from you. Solve one problem they are Googling this week. That is the whole game." },
      {
        heading: "Why it works",
        body: "Three reasons it compounds:\n\n- You own the list, so no algorithm decides who sees it\n- It fills your pipeline while you sleep\n- It is the one marketing asset nobody can take away",
      },
    ],
    quote: "The newsletter is a private conversation at scale, not a broadcast.",
    cta: { label: "Reply and tell me", url: "#" },
    signoff: "— Daniel",
  };
  let heroPrompt = "";
  let inlinePrompt: string | null = null;

  try {
    const { object } = await generateObject({
      model: model(),
      schema: NewsletterSchema,
      maxTokens: 2400,
      maxRetries: 1,
      system:
        "You are Danny's Newsletter specialist." +
        (guide.found
          ? `\n\nFollow this NEWSLETTER PLAYBOOK from the founder's own knowledge base — it is authoritative. Apply its core principle, structure, and rules:\n\n${(guide.content || "").slice(0, 7000)}\n\n---\n`
          : "") +
        `\n\nWrite ONE complete email newsletter in Danny's EXACT voice. It must read like a private note to ONE person, not a broadcast: personal, specific, genuinely useful. Solve one real problem or shift one belief, then sell softly with a single clear CTA at the end. Structure it cleanly for skim-reading: a short kicker, a punchy title, 2-4 scannable sections, the occasional bullet list or '### ' subheading ONLY where it earns its place, and ONE pull-quote if a sentence deserves the spotlight. Elegant and uncluttered, never busy. Short paragraphs. No corporate filler, no hashtag spam, never invent metrics.\n\nAlso act as ART DIRECTOR for the image assets: invent ONE concrete, purpose-built visual CONCEPT for the hero (and optionally a second for inline) that VISUALIZES a real idea from THIS specific newsletter — a metaphor or scene with specific objects, the kind a brand studio would design. Say exactly what is in the frame. Never generic office/laptop/handshake stock, never a vague mood.\n\n` +
        NO_EMDASH_RULE,
      prompt:
        `Request: "${instruction}"\n\n` +
        `Creative brief from Research:\n${brief}\n\n` +
        (voice.found ? `Voice DNA:\n${voice.body.slice(0, 2200)}` : "Voice DNA unavailable — write in a confident, direct founder voice."),
    });
    const o = deDash(object);
    content = {
      kicker: o.kicker,
      subject: o.subject,
      preview: o.preview,
      title: o.title,
      intro: o.intro,
      sections: o.sections,
      quote: o.quote ?? undefined,
      cta: o.cta,
      signoff: o.signoff,
    };
    heroPrompt = o.heroPrompt;
    inlinePrompt = o.inlinePrompt ?? null;
  } catch {
    /* keep grounded fallback */
  }

  emit({ type: "agent.output", node: "newsletter", summary: `“${content.subject}”`, at: now() });
  await beat(200);

  // Up to TWO gpt-image asset calls — LIGHT themed, rendered CONCURRENTLY so they
  // stay well within the function budget.
  const client = await defaultClient();
  const brand = await getBrandKit(client);
  const accent = brand?.accentHex || "#ED1846";
  if (imageModelConfigured() && heroPrompt) {
    emit({ type: "agent.status", node: "newsletter", status: "Rendering image assets · gpt-image", at: now() });
    emit({ type: "agent.tool", node: "newsletter", tool: "gpt-image", detail: inlinePrompt ? "2 light assets" : "1 light asset", at: now() });
    const quality = (process.env.OPENAI_IMAGE_QUALITY as "low" | "medium" | "high" | "auto") || "high";
    const [hero, inline] = await Promise.all([
      generateImage(newsletterImagePrompt(heroPrompt, accent), { quality, size: "1536x1024" }),
      inlinePrompt ? generateImage(newsletterImagePrompt(inlinePrompt, accent), { quality, size: "1024x1024" }) : Promise.resolve(null),
    ]);
    content.heroImage = hero ?? undefined;
    content.inlineImage = inline ?? undefined;
  }

  const html = buildNewsletterHtml(brand, content);
  const data: NewsletterArtifactData = { subject: content.subject, preview: content.preview, html, grounding };
  emit({ type: "agent.status", node: "newsletter", status: "Newsletter ready", at: now() });
  emit({ type: "artifact", kind: "newsletter", data, at: now() });
  await beat(200);
  emit({ type: "agent.report", from: "newsletter", to: "content", summary: "Newsletter delivered", at: now() });
  await beat(360);
  return data;
}

/** Text / picture / reels / long-form: produce real copy or a script in voice. */
async function runScript(
  leaf: JarvisNodeId,
  instruction: string,
  brief: string,
  emit: Emit,
  grounding: string[]
): Promise<string> {
  const fmt = node(leaf);
  emit({ type: "agent.activate", node: leaf, label: fmt.label, at: now() });
  await beat(500);
  emit({ type: "agent.status", node: leaf, status: "Matching your voice", at: now() });
  const voice = await readDoc("voice-dna", leaf, emit, grounding);

  // Pull the matching master prompt from the content playbook. Text/picture have
  // dedicated sections; video scripts (reels/longform) have none → null.
  const guide = await getContentGuide({ format: leaf, task: `${instruction}\n\n${brief}` });
  if (guide) {
    grounding.push(`content guide: ${guide.title}`);
    emit({ type: "agent.tool", node: leaf, tool: "Content guide", detail: guide.title, at: now() });
    await beat(260);
  }
  emit({ type: "agent.status", node: leaf, status: `Writing the ${fmt.title.toLowerCase()}`, at: now() });

  const isScript = leaf === "reels" || leaf === "longform";
  const shape =
    leaf === "reels"
      ? "a short-form video script: a 1-line hook, then 4-6 punchy spoken beats, then a CTA line. Mark [HOOK] / [BEAT] / [CTA]."
      : leaf === "longform"
        ? "a long-form video script outline: a cold-open hook, 3-4 titled sections each with 2-3 spoken bullets, and a close."
        : leaf === "picture"
          ? "a single-image post: one bold on-image line, then a 3-4 sentence caption."
          : "a LinkedIn text post: a scroll-stopping hook line, 4-7 short lines of body, and a soft CTA.";

  let out = `Drafted a ${fmt.title.toLowerCase()} grounded in your positioning.`;
  try {
    const { text } = await generateText({
      model: model(),
      maxTokens: 700,
      system:
        `You are Danny's Content team writing ${shape}` +
        (guide ? ` Follow this MASTER CONTENT GUIDE exactly as the authoritative playbook:\n\n${guide.body}\n\n---\n\n` : " ") +
        `Write in Danny's EXACT voice (match the loaded Voice DNA). Short, punchy, no hashtag spam, no corporate filler. Ground every claim in the brief; never invent metrics. ${NO_EMDASH_RULE}`,
      prompt:
        `Request: "${instruction}"\n\nCreative brief from Research:\n${brief}\n\n` +
        (voice.found ? `Voice DNA:\n${voice.body.slice(0, 2200)}` : "Voice DNA unavailable — write confident and direct."),
    });
    if (text.trim()) out = stripEmDashes(text.trim());
  } catch {
    /* keep fallback */
  }

  const summary = out.split("\n").map((l) => l.replace(/^[#*\->\s\[\]A-Z]+\]?\s*/, "").trim()).find((l) => l.length > 8)?.slice(0, 110) ?? `${fmt.title} drafted`;
  emit({ type: "agent.status", node: leaf, status: `${fmt.title} ready`, at: now() });
  await beat(300);
  emit({ type: "agent.output", node: leaf, summary, at: now() });
  await beat(250);
  emit({ type: "agent.report", from: leaf, to: "content", summary: `${fmt.title} delivered`, at: now() });
  await beat(400);
  return out;
}

const SPECIALIST_BRIEF: Partial<Record<JarvisNodeId, { doc?: string; shape: string }>> = {
  webpages: {
    doc: "offer-strategy",
    shape:
      "a landing-page blueprint: the headline and subhead, 3-4 sections each with a title and the actual copy, the single primary CTA, and the proof to feature.",
  },
  ops: {
    doc: "rule-of-one",
    shape: "an operating plan: a prioritized weekly schedule and the systems/checklists needed to run it reliably.",
  },
};

/** Leads / web pages / ops: read a relevant doc, produce a real grounded deliverable. */
async function runGenericSpecialist(
  leaf: JarvisNodeId,
  instruction: string,
  emit: Emit,
  grounding: string[]
): Promise<string> {
  const n = node(leaf);
  const cfg = SPECIALIST_BRIEF[leaf] ?? { shape: "a concise, grounded, actionable deliverable" };
  emit({ type: "agent.activate", node: leaf, label: n.label, at: now() });
  await beat(450);
  emit({ type: "agent.status", node: leaf, status: "Reading your positioning", at: now() });
  let docText = "";
  if (cfg.doc) {
    const d = await readDoc(cfg.doc, leaf, emit, grounding);
    if (d.found) docText = d.body.slice(0, 2400);
  }
  emit({ type: "agent.status", node: leaf, status: `Drafting the ${n.title.toLowerCase()}`, at: now() });

  let out = `${n.title} deliverable prepared, grounded in your positioning.`;
  try {
    const { text } = await generateText({
      model: model(),
      maxTokens: 900,
      system: `You are the founder's ${n.title} specialist. Produce ${cfg.shape} Ground everything in the founder's real positioning; never invent metrics. Be specific, concrete, and immediately usable. No preamble.`,
      prompt: `Request: "${instruction}"\n\nFounder docs:\n${docText || "(none available — reason from a high-trust B2B founder positioning)"}`,
    });
    if (text.trim()) out = stripEmDashes(text.trim());
  } catch {
    /* keep fallback */
  }

  const summary =
    out.split("\n").map((l) => l.replace(/^[#*\->\s]+/, "").trim()).find((l) => l.length > 8)?.slice(0, 110) ??
    `${n.title} drafted`;
  emit({ type: "agent.status", node: leaf, status: `${n.title} ready`, at: now() });
  await beat(280);
  emit({ type: "agent.output", node: leaf, summary, at: now() });
  await beat(220);
  emit({ type: "agent.report", from: leaf, to: node(leaf).parent ?? "kronos", summary: "Delivered", at: now() });
  await beat(380);
  return out;
}

/* --------------------------- leads (CRO) --------------------------- */

const LeadsPlanSchema = z.object({
  icp: z.string().describe("One sentence: exactly who we are targeting."),
  criteria: z
    .array(z.string())
    .describe("4-7 short search-criteria chips in plain English (roles, seniority, function, geography, company size, buying signals)."),
  qualification: z
    .array(z.string())
    .describe("3-5 in/out qualification rules grounded in the ICP's documented buying & interest signals."),
  filters: z.object({
    searchQuery: z
      .string()
      .describe("Free-text LinkedIn people search combining the target role and the niche. Always provide this."),
    jobTitles: z.array(z.string()).optional().describe("Exact current job titles to target."),
    locations: z.array(z.string()).optional().describe("Full country/city names, e.g. 'United States', 'United Kingdom', 'London'."),
    seniority: z
      .array(z.string())
      .optional()
      .describe("Subset of: In Training, Entry Level, Senior, Strategic, Entry Level Manager, Experienced Manager, Director, Vice President, CXO, Owner / Partner."),
    functions: z
      .array(z.string())
      .optional()
      .describe("Subset of LinkedIn functions, e.g. Sales, Marketing, Operations, Finance, Engineering, Information Technology."),
    companySize: z
      .array(z.string())
      .optional()
      .describe("Subset of: Self-Employed, 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+."),
    recentlyChangedJobs: z.boolean().optional().describe("Only people who changed jobs in the last 90 days."),
  }),
  count: z.number().int().min(1).max(MAX_LEADS).describe("How many prospects to scrape — the number the user asked for."),
  findEmails: z.boolean().describe("true only when the user wants emails for outreach."),
});

/** Pull an explicit lead count from the instruction ("50 leads", "find me 30 prospects"). */
function parseRequestedCount(instruction: string): number | null {
  const near = instruction.match(/(\d{1,4})\s*(?:leads?|prospects?|icps?|people|contacts?|profiles?|names?)/i);
  if (near) {
    const n = parseInt(near[1], 10);
    if (n > 0) return Math.min(MAX_LEADS, n);
  }
  const verb = instruction.match(/(?:find|get|give|scrape|pull|build|list|grab)\s+(?:me\s+)?(?:a\s+)?(\d{1,4})/i);
  if (verb) {
    const n = parseInt(verb[1], 10);
    if (n > 0) return Math.min(MAX_LEADS, n);
  }
  return null;
}

/**
 * Leads specialist: read the real ICP, design an executable LinkedIn search,
 * scrape REAL prospects via Apify, and deliver the plan + the prospect sheet.
 * Always produces a usable plan; the live scrape is additive (and graceful when
 * APIFY_TOKEN is unset).
 */
async function runLeads(instruction: string, emit: Emit, grounding: string[]): Promise<LeadsArtifactData> {
  emit({ type: "agent.activate", node: "leads", label: node("leads").label, at: now() });
  await beat(450);
  emit({ type: "agent.status", node: "leads", status: "Reading your ICP", at: now() });

  const icp = await readDoc("icp-profile", "leads", emit, grounding);
  const intake = await readDoc("icp-intake", "leads", emit, grounding);
  const offer = await readDoc("offer-strategy", "leads", emit, grounding);
  const roadmap = await readDoc("strategic-roadmap", "leads", emit, grounding);

  const docContext = [icp, intake, offer, roadmap]
    .filter((d) => d.found)
    .map((d) => `## ${d.title}\n${d.body.slice(0, 2000)}`)
    .join("\n\n");

  emit({ type: "agent.status", node: "leads", status: "Designing the target search", at: now() });

  const requested = parseRequestedCount(instruction);
  const wantsEmail = /\b(e-?mail|outreach|cold)\b/i.test(instruction);

  type LeadsPlan = {
    icp: string;
    criteria: string[];
    qualification: string[];
    filters: {
      searchQuery?: string;
      jobTitles?: string[];
      locations?: string[];
      seniority?: string[];
      functions?: string[];
      companySize?: string[];
      recentlyChangedJobs?: boolean;
    };
    count: number;
    findEmails: boolean;
  };

  let plan: LeadsPlan = {
    icp: "Decision-makers who match the founder's documented ICP.",
    criteria: ["Roles from the ICP", "Decision-making seniority", "Target geographies"],
    qualification: [
      "In: matches the ICP firmographics and shows a documented buying signal",
      "Out: wrong role, region, or company size",
    ],
    filters: { searchQuery: "" },
    count: requested ?? 25,
    findEmails: wantsEmail,
  };

  try {
    const { object } = await generateObject({
      model: model(),
      schema: LeadsPlanSchema,
      maxTokens: 1100,
      maxRetries: 1,
      system:
        "You are the founder's Leads specialist (CRO team). Read the founder's REAL ICP and turn it into an EXECUTABLE LinkedIn people-search. " +
        "Produce: a one-line ICP, plain-English search criteria, in/out qualification rules grounded in the documented buying signals, and concrete scraper filters. " +
        "filters.searchQuery is required and must combine the target role with the niche. Map seniority/functions/companySize to the allowed labels only. Never invent firmographics that contradict the ICP. " +
        `Set count to the number the user asked for (default 25, max ${MAX_LEADS}). Set findEmails true only if the user wants emails / outreach.`,
      prompt: `Request: "${instruction}"\n\nFounder ICP & offer docs:\n${docContext || "(none available — infer a sensible B2B ICP and say so in the icp line)"}`,
    });
    plan = {
      icp: object.icp,
      criteria: object.criteria,
      qualification: object.qualification,
      filters: object.filters,
      count: requested ?? object.count,
      findEmails: wantsEmail || object.findEmails,
    };
  } catch {
    /* keep grounded defaults */
  }

  const count = Math.max(1, Math.min(MAX_LEADS, plan.count));

  // Scrape REAL prospects from LinkedIn via Apify
  emit({ type: "agent.status", node: "leads", status: `Scraping ${count} LinkedIn prospects`, at: now() });
  emit({
    type: "agent.tool",
    node: "leads",
    tool: "Apify · linkedin-profile-search",
    detail: `scraping ${count} profiles${plan.findEmails ? " + emails" : ""}`,
    at: now(),
  });

  const result = await scrapeLinkedInLeads({ ...plan.filters, count, findEmails: plan.findEmails });
  const testMode = leadsTestMode();

  // Enrich (outreach-ready) when the founder asked for verified emails / outreach
  // / personalization, or emails were requested at scrape time.
  const wantsEnrich =
    /\b(enrich|verif(y|ied)|outreach|personaliz\w*|warm|deep profile|recent activity|engag\w*)\b/i.test(instruction) ||
    plan.findEmails;

  const toRow = (l: EnrichedLead): LeadRow => ({
    name: l.name,
    title: l.title || l.headline,
    company: l.company,
    location: l.location,
    linkedinUrl: l.linkedinUrl,
    email: l.email,
    emailStatus: l.enrichment?.emailStatus,
    headline: l.enrichment?.headline || l.headline,
    about: l.enrichment?.about,
    skills: l.enrichment?.skills,
    recentActivity: l.enrichment?.recentPosts?.[0]?.text,
  });
  const snapshot = (rows: EnrichedLead[], phase: "scraping" | "enriching" | "done", note: string): LeadsArtifactData => ({
    title: plan.icp.length > 0 && plan.icp.length <= 60 ? plan.icp : `${count} prospects for your ICP`,
    icp: plan.icp,
    criteria: plan.criteria,
    qualification: plan.qualification,
    leads: rows.map(toRow),
    requested: count,
    returned: result.returned,
    withEmail: rows.filter((l) => l.email).length,
    enriched: rows.filter((l) => l.enrichment).length,
    verifiedEmail: rows.filter((l) => l.enrichment?.emailVerified).length,
    withActivity: rows.filter((l) => l.enrichment?.recentPosts?.length).length,
    configured: result.configured,
    note,
    grounding: Array.from(new Set(grounding)),
    phase,
    testMode,
  });

  // Surface the targeting brief + an empty (skeleton) table immediately, then
  // stream rows in as they arrive.
  emit({ type: "artifact", kind: "leads", data: snapshot([], "scraping", result.note), at: now() });
  await beat(200);

  let finalRows: EnrichedLead[] = result.leads;

  if (result.ok && result.returned > 0) {
    // Dribble scraped rows in (one-by-one feel in test mode; single batch live).
    const acc: EnrichedLead[] = [];
    const chunk = testMode ? 3 : result.leads.length;
    for (let k = 0; k < result.leads.length; k += chunk) {
      acc.push(...result.leads.slice(k, k + chunk));
      emit({ type: "artifact", kind: "leads", data: snapshot(acc, "scraping", result.note), at: now() });
      if (testMode) await beat(140);
    }
    emit({
      type: "agent.output",
      node: "leads",
      summary: `${result.returned} prospects scraped${result.withEmail ? `, ${result.withEmail} with email` : ""}`,
      at: now(),
    });

    if (wantsEnrich) {
      emit({ type: "agent.status", node: "leads", status: "Enriching · profile + recent activity + email verify", at: now() });
      emit({ type: "agent.tool", node: "leads", tool: "Apify · enrichment", detail: "apimaestro profile · harvestapi posts · email find + verify", at: now() });
      // mirror array we mutate as each lead enriches, so the table fills live
      const live: EnrichedLead[] = result.leads.map((l) => ({ ...l }));
      const enr = await enrichLeads(result.leads, {
        deepProfile: true,
        recentActivity: true,
        verifyEmail: true,
        limit: 40,
        onLead: (lead) => {
          const idx = live.findIndex((l) => l.linkedinUrl === lead.linkedinUrl);
          if (idx >= 0) live[idx] = lead;
          emit({ type: "artifact", kind: "leads", data: snapshot(live, "enriching", "Enriching prospects…"), at: now() });
        },
      });
      if (enr.configured) {
        finalRows = enr.leads;
        grounding.push("enrichment: deep profile + email verify");
        emit({ type: "agent.output", node: "leads", summary: enr.note, at: now() });
      }
    }
  } else {
    emit({
      type: "agent.status",
      node: "leads",
      status: result.configured ? "Scrape returned no rows" : "Plan ready · set APIFY_TOKEN or LEADS_TEST_MODE",
      at: now(),
    });
    emit({
      type: "agent.output",
      node: "leads",
      summary: result.configured
        ? "Targeting plan ready, no rows for these filters"
        : "Targeting plan ready, add APIFY_TOKEN (or LEADS_TEST_MODE=true) to pull prospects",
      at: now(),
    });
  }

  const data = snapshot(finalRows, "done", result.note);
  emit({ type: "artifact", kind: "leads", data, at: now() });
  await beat(280);
  emit({
    type: "agent.report",
    from: "leads",
    to: "cro",
    summary: result.returned > 0 ? `${result.returned} prospects delivered` : "Targeting plan delivered",
    at: now(),
  });
  await beat(400);
  return data;
}

/* --------------------------- department run --------------------------- */

type DeliverableSink = {
  contributions: { label: string; text: string }[];
  setCarousel: (d: CarouselArtifactData) => void;
  setLeads: (d: LeadsArtifactData) => void;
  setNewsletter: (d: NewsletterArtifactData) => void;
};

/**
 * One department head takes its slice of the job and delegates to its own
 * specialists/tools, in order. Shared research has already run; `brief` carries
 * its angle. Department runs are fired in PARALLEL by the caller, so this emits
 * its own activate/report bracket and never touches global ordering.
 */
async function runDepartment(
  instruction: string,
  assignment: RouteAssignment,
  brief: string,
  emit: Emit,
  grounding: string[],
  sink: DeliverableSink
): Promise<string> {
  const dept = node(assignment.department);
  emit({ type: "agent.activate", node: dept.id, label: `${dept.title} takes the job`, at: now() });
  emit({
    type: "agent.status",
    node: dept.id,
    status: `Waking ${assignment.plan.length} specialist${assignment.plan.length > 1 ? "s" : ""}`,
    at: now(),
  });
  await beat(500);

  // Content is a sub-team: it activates once, then routes to the format.
  let contentEngaged = false;
  const engageContent = async () => {
    if (contentEngaged) return;
    contentEngaged = true;
    emit({ type: "agent.activate", node: "content", label: "Content picks the format", at: now() });
    await beat(420);
  };

  let summary = "Work complete";

  for (const leaf of assignment.plan) {
    if (leaf === "research") continue; // shared — already ran for the whole team
    if (leaf === "leads") {
      const d = await runLeads(instruction, emit, grounding);
      sink.setLeads(d);
      sink.contributions.push({
        label: `${dept.title} · Leads`,
        text:
          d.returned > 0
            ? `Scraped ${d.returned} real LinkedIn prospects for: ${d.icp}. Criteria: ${d.criteria.join(
                "; "
              )}. (Full sheet in the Leads tab${d.withEmail ? `, ${d.withEmail} with email` : ""}.)`
            : `Targeting plan ready for: ${d.icp}. ${d.note}`,
      });
      summary = d.returned > 0 ? `${d.returned} prospects ready` : "Targeting plan ready";
    } else if (isFormat(leaf)) {
      await engageContent();
      if (leaf === "carousel") {
        const d = await runCarousel(instruction, brief, emit, grounding);
        sink.setCarousel(d);
        sink.contributions.push({
          label: `${dept.title} · Carousel`,
          text: `A ${d.slides.length}-slide carousel "${d.topic}" + caption was produced. (See the Carousel tab.)`,
        });
        summary = `Carousel on "${d.topic}" ready`;
      } else if (leaf === "newsletter") {
        const d = await runNewsletter(instruction, brief, emit, grounding);
        sink.setNewsletter(d);
        sink.contributions.push({
          label: `${dept.title} · Newsletter`,
          text: `A complete on-brand newsletter "${d.subject}" was written and rendered as a ready-to-send HTML email. (See the Newsletter tab.)`,
        });
        summary = `Newsletter "${d.subject}" ready`;
      } else {
        const out = await runScript(leaf, instruction, brief, emit, grounding);
        sink.contributions.push({ label: `${dept.title} · ${node(leaf).title}`, text: out });
        summary = `${node(leaf).title} drafted`;
      }
    } else {
      const out = await runGenericSpecialist(leaf, instruction, emit, grounding);
      sink.contributions.push({ label: `${dept.title} · ${node(leaf).title}`, text: out });
      summary = `${node(leaf).title} delivered`;
    }
  }

  if (contentEngaged) {
    emit({ type: "agent.report", from: "content", to: dept.id, summary: "Format delivered", at: now() });
    await beat(360);
  }

  emit({ type: "agent.status", node: dept.id, status: "Reporting up to the CEO", at: now() });
  await beat(420);
  emit({ type: "agent.report", from: dept.id, to: "kronos", summary, at: now() });
  await beat(360);
  return summary;
}

/** Fold what the team produced into a rich, block-formatted report for the panel. */
async function synthesizeReport(
  instruction: string,
  deptTitle: string,
  contributions: { label: string; text: string }[],
  grounding: string[]
): Promise<string> {
  const material = contributions.length
    ? contributions.map((c) => `## ${c.label}\n${c.text}`).join("\n\n")
    : "(the team acknowledged the request — no long-form artifact)";
  const fallback =
    `# ${deptTitle} report\n\n[[callout:note]]\nThe work is complete. Open the mission feed for the full detail.\n[[/callout]]` +
    (contributions[0] ? `\n\n[[callout:insight]]\n${contributions[0].text.slice(0, 280)}\n[[/callout]]` : "");
  try {
    const { text } = await generateText({
      model: model(),
      maxTokens: 2600,
      system:
        `You are the founder's ${deptTitle}, briefing the founder on the work your team just finished. This briefing is the headline deliverable — make it genuinely powerful, not a summary. ` +
        CORE_BLOCK_GRAMMAR +
        `\n\nReport ONLY on the actual material below. Structure:\n` +
        `1. Open with a '# ' title and a 2-3 sentence framing that names the strategic bet, not just what was done.\n` +
        `2. Then 6-9 rich blocks chosen by the SHAPE of the content — vary them (don't stack three callouts). Reach for the high-signal blocks: a [[kpi]] or [[stats]] when there are real numbers, [[steps]] for a playbook, [[timeline]] for sequencing, [[decision]] for a rule of thumb, [[people]]/[[table]] for rosters or comparisons.\n` +
        `3. If a deliverable is a finished piece of writing (a post or a script), show it VERBATIM inside a [[quote]] or [[callout]], THEN add the strategy around it: why the hook lands, the psychology it targets, the objection it removes.\n` +
        `4. Always end with a concrete [[actions]] block — the founder's exact next moves (when to post, who to send it to, what to measure).\n\n` +
        `Be specific and concrete; every claim grounded in the material. Never invent numbers or quote text that isn't there. No filler, no "in conclusion". ${NO_EMDASH_RULE}`,
      prompt: `Founder's instruction: "${instruction}"\n\nWhat your team produced:\n${material}\n\nGrounded in: ${grounding.length ? Array.from(new Set(grounding)).join(", ") : "(general positioning)"}`,
    });
    if (text.trim()) return stripEmDashes(text.trim());
  } catch {
    /* keep fallback */
  }
  return fallback;
}

/* --------------------------- the run --------------------------- */

export async function POST(req: Request) {
  const { instruction } = (await req.json().catch(() => ({}))) as { instruction?: string };
  const text = (instruction ?? "").trim() || "Build me a carousel";
  const runId = `run_${now().toString(36)}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const emit: Emit = (e) => controller.enqueue(enc.encode(encodeEvent(e)));

      try {
        emit({ type: "run.start", runId, instruction: text, at: now() });
        await beat(400);

        // KRONOS comes online and reads the intent
        emit({ type: "agent.activate", node: "kronos", label: "Reading the intent", at: now() });
        emit({ type: "agent.status", node: "kronos", status: "Delegating across the team", at: now() });
        const route = await routeWithKronos(text);
        await beat(450);
        emit({ type: "route", rationale: route.rationale, assignments: route.assignments, shared: route.shared, at: now() });
        await beat(550);

        const grounding: string[] = [];
        let brief = "";
        let madeCarousel = false;
        let madeLeads = false;
        let madeNewsletter = false;
        const contributions: { label: string; text: string }[] = [];
        const sink: DeliverableSink = {
          contributions,
          setCarousel: () => {
            madeCarousel = true;
          },
          setLeads: () => {
            madeLeads = true;
          },
          setNewsletter: () => {
            madeNewsletter = true;
          },
        };

        // Shared research runs ONCE, first, and feeds every department.
        if (route.shared.includes("research")) {
          brief = await runResearch(text, "kronos", emit, grounding);
          contributions.push({ label: "Research — shared angle & talking points", text: brief });
        }

        // Department heads work in PARALLEL — a real team. One department hitting
        // a snag doesn't sink the whole run.
        await Promise.all(
          route.assignments.map((a) =>
            runDepartment(text, a, brief, emit, grounding, sink).catch(() => {
              emit({ type: "agent.status", node: a.department, status: "Hit a snag, skipped", at: now() });
              return "skipped";
            })
          )
        );

        // The CEO folds it all into one briefing. Skip it only for a single
        // department whose deliverable IS a visual artifact (carousel / leads).
        const multi = route.assignments.length > 1;
        const hasArtifact = madeCarousel || madeLeads || madeNewsletter;
        if (multi || !hasArtifact) {
          emit({ type: "agent.status", node: "kronos", status: "Folding it into one briefing", at: now() });
          await beat(300);
          const reportTitle = multi ? "chief of staff" : node(route.assignments[0].department).title;
          const md = await synthesizeReport(text, reportTitle, contributions, grounding);
          emit({ type: "response", format: "blocks", markdown: md, at: now() });
          await beat(250);
        }

        emit({ type: "agent.status", node: "kronos", status: "Done. Output is in the dashboard.", at: now() });
        emit({ type: "run.complete", at: now() });
      } catch (err) {
        emit({ type: "run.error", message: err instanceof Error ? err.message : String(err), at: now() });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
