"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { Blocks, parseBlocks } from "@/components/blocks/Blocks";

/**
 * Standalone gallery of the answer-block stockpile — open /blocks-preview to review every UI
 * element the AI can emit, and watch the "card first, then content" form-up via the real
 * streaming renderer. The panel matches the in-chat width; hit Replay to re-run the animation.
 */

// One realistic "answer" per section so each block is shown in the situation it's meant for.
const SECTIONS: { label: string; doc: string }[] = [
  {
    label: "Call recap — timeline · people · quote · decision · actions",
    doc: `# Your call with Dana — the short version
She wants pipeline visibility, not another dashboard. You reframed the deal around a six-week outcome, held the line on price, and walked away with a clear next step on the calendar.

[[timeline:How the call went]]
0:02 | Reframed the goal | Dana wants to *see* her pipeline, not more dashboards, see [[Dana - Discovery]]
0:11 | Pricing objection | She pushed on the €4k tier; you anchored to the **6-week outcome** instead of hours
0:19 | Agreed next step | She sends Q3 numbers Thursday, you send the scoped SOW Friday
[[/timeline]]

[[people:Who was on it]]
Dana Cole | VP Ops @ Acme | Economic buyer, cares about pipeline visibility, see [[Dana - Discovery]]
Marcus Lee | Eng lead @ Acme | Technical blocker, wants SSO before signing
[[/people]]

[[quote:Dana]]
Honestly, if I could just see where deals are stuck, I'd sign tomorrow.
[[/quote]]

[[decision:Stalled deal rule]]
**When:** A deal sits past 30 days with no scheduled next step
**Then:** Send one direct "are we still a fit?" message, then archive it
**Because:** Chasing dead pipeline costs more than the deal is worth, see [[Sales Principles]]
[[/decision]]

[[actions]]
- Send Dana the scoped SOW by Friday, capped to the 6-week outcome
- Loop Marcus in on the SSO question before pricing is final
- Log the €2,500 floor against the Acme opportunity
[[/actions]]`,
  },
  {
    label: "Business facts — KPI · stats · meter · bars",
    doc: `# Where the business stands
[[kpi:emerald]]
$248k | Total pipeline value | +18% MoM | across 12 open deals
[[/kpi]]

[[stats]]
Closed this Q | $96k | 4 deals
Avg deal size | €2,500 | workshop floor
Calls booked | 18 | this month
Win rate | 31% | last 90 days
[[/stats]]

[[meter:Toward Q2 goals]]
MRR | 42000 | 50000 | $
Calls booked | 18 | 25 | calls
Pipeline closed | 96000 | 80000 | $
[[/meter]]

[[bars:Revenue by offer]]
Done-for-you | 142000 | $
Workshop | 68000 | $
Coaching | 41000 | $
Audit | 12000 | $
[[/bars]]`,
  },
  {
    label: "Framework + definition — steps · define · callouts · chips",
    doc: `# Your discovery framework
[[steps:My discovery call framework]]
Frame | Open with the outcome they want, not the features
Diagnose | Three pain questions, quantify the cost of each, see [[Discovery Notes]]
Prescribe | Map exactly **one** offer tier to the biggest pain
Close | Get a mutual next step on the calendar before you hang up
[[/steps]]

[[define:6-week outcome model]]
You scope every engagement to **one measurable outcome delivered in six weeks**, never an hourly retainer. It keeps both sides honest and makes renewals a yes/no on results. See [[Pricing Philosophy]].
[[/define]]

[[callout:win]]
Your "I built an AI team" angle is the single biggest driver of inbound right now.
[[/callout]]

[[callout:risk]]
You have three deals with no next step booked, which your own stalled-deal rule says to clear.
[[/callout]]

[[keypoints]]
- Lead with the outcome, never the feature list, in the first two minutes
- Quantify the cost of the pain so price becomes a comparison, not a number
- One offer tier per call keeps the close clean
[[/keypoints]]

[[chips:Topics]]
Discovery, Pricing, 6-week outcome, Acme, Workshop offer
[[/chips]]`,
  },
  {
    label: "Tabular data — table block + raw-markdown fallback",
    doc: `# Active pipeline
[[table:Open deals]]
Deal | Stage | Value | Next step
Acme | Proposal | $48k | SOW Friday, see [[Dana - Discovery]]
Northwind | Discovery | $22k | Demo Tuesday
Globex | Negotiation | $65k | Legal review
Initech | Closed won | $30k | Kickoff booked
[[/table]]

If the model writes a plain markdown table instead, it should still render as glass (no toolbar):

| Channel | Calls | Booked |
| --- | --- | --- |
| Inbound | 42 | 18 |
| Referral | 16 | 9 |
| Outbound | 60 | 6 |`,
  },
  {
    label: "Content ideas — post previews (subtitle waits for the hook)",
    doc: `Here are two posts to ship next:

[[idea]]
**Hook:** I built a virtual AI assistant to handle my sales calls. Here is the exact stack.
**Angle:** Walk through the tools and wiring, with screenshots.
**Format:** Short video demonstration
**Why:** Your "I built X" posts are your top performers by a wide margin.
[[/idea]]

[[idea]]
**Hook:** The secret AI strategy top founders use to double their leads.
**Angle:** Reveal a proven framework for lead generation.
**Format:** Text post with bullet points
**Why:** Strategy posts align with your highest engagement themes.
[[/idea]]`,
  },
];

export default function BlocksPreview() {
  return (
    <main className="min-h-dvh bg-[#02040a] px-10 py-10 text-white">
      <div className="mx-auto max-w-[820px]">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.32em] text-cyan-300/70">Answer block stockpile</div>
        <h1 className="mb-2 text-2xl font-light tracking-tight text-white/90">Every element, with the form-up motion</h1>
        <p className="mb-8 max-w-[60ch] text-sm leading-relaxed text-white/45">
          Each section streams through the real renderer the stage uses: the glass card lands first, then its content
          resolves into focus. Charts are LinkedIn-only and live on /charts-preview.
        </p>
        <div className="space-y-12">
          {SECTIONS.map((s) => (
            <Section key={s.label} label={s.label} doc={s.doc} />
          ))}
        </div>
      </div>
    </main>
  );
}

function Section({ label, doc }: { label: string; doc: string }) {
  const [run, setRun] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => parseBlocks(doc), [doc]);
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.16em] text-white/35">{label}</h2>
        <button
          onClick={() => setRun((n) => n + 1)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] text-white/60 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
        >
          <ArrowClockwise size={12} weight="bold" /> Replay
        </button>
      </div>
      <div ref={scrollRef} className="rounded-2xl border border-white/5 bg-[#02040a] p-5 text-[14px]">
        <Blocks key={run} blocks={blocks} stream />
      </div>
    </section>
  );
}
