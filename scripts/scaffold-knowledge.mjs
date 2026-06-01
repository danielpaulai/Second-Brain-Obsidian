#!/usr/bin/env node
/**
 * Phase A: Scaffold the AI Danny knowledge taxonomy.
 *
 * V2 taxonomy — 15 macros, ~266 sub-categories, mapped tightly to Danny's
 * actual work patterns (1:1 PB coaching, workshops, sales discovery, AI stack,
 * mentor influences, decisions library, etc.) instead of generic buckets.
 *
 * Usage:
 *   node scripts/scaffold-knowledge.mjs            # create / preserve existing
 *   node scripts/scaffold-knowledge.mjs --clean    # wipe + regenerate
 *
 * Reads VAULT_PATH from .env.local.
 */

import fs from "node:fs/promises";
import path from "node:path";

/* --------------------------------------------------------------------------
 * Taxonomy
 *
 * Format: [slug, title, description]
 * Macro = { dir, title, description, items[] }
 * -------------------------------------------------------------------------- */

const TAXONOMY = [
  {
    macro: "01-identity-worldview",
    title: "Identity & Worldview",
    description: "Who Danny is at the core — beliefs, values, energy, ambitions.",
    items: [
      ["origin-story", "Origin story", "How you got to Purely Personal. The moment. The failure. The decision."],
      ["why-finland-matters", "Why Finland matters", "Place, culture, context. Why operating from there shapes the work."],
      ["core-beliefs-about-work", "Core beliefs about work", "Non-negotiable principles. How work should be done."],
      ["views-on-success", "Views on success", "What success looks like to you. And what it doesn't."],
      ["views-on-money", "Views on money", "What it is, what it isn't, how you relate to it."],
      ["views-on-freedom", "Views on freedom", "Time, options, optionality — what freedom means in practice."],
      ["spiritual-faith-lens", "Spiritual / faith lens", "The deeper why. References to God, vision, calling, purpose."],
      ["family-partnership-lens", "Family / partnership lens", "How family and partnership shape your choices."],
      ["energy-management", "Energy management", "How you protect your energy. Mornings, breaks, what drains you."],
      ["long-term-ambitions-10y", "Long-term ambitions (10y)", "Where you're going in a decade. The unwritten goals."],
      ["mid-term-ambitions-3y", "Mid-term ambitions (3y)", "The 3-year plan. What changes by then."],
      ["failure-stories", "Failure stories", "Times something didn't work. Real, named, what you learned."],
      ["what-you-protect", "What you protect", "Things you refuse to compromise. Time, voice, integrity."],
      ["what-you-let-slip", "What you let slip", "Low-priority work you deliberately under-invest in."],
      ["daily-rituals", "Daily rituals", "Mornings, focus blocks, end of day."],
      ["decision-framework", "Decision framework", "How you make decisions. Speed, criteria, what you sleep on."],
      ["personal-red-lines", "Personal red lines", "Things you will never do regardless of payoff."],
      ["quotes-you-live-by", "Quotes you live by", "Phrases, scriptures, mentor lines that anchor your choices."],
    ],
  },
  {
    macro: "02-voice-communication",
    title: "Voice & Communication",
    description: "Exactly how Danny writes and speaks across every context.",
    items: [
      ["sentence-rhythm-rules", "Sentence rhythm rules", "Long/short cadence, paragraph length, the Taki one-sentence rule."],
      ["hook-patterns-library", "Hook patterns library", "Specific hook formulas you actually use, with examples."],
      ["words-you-ban", "Words you ban", "The full anti-slop list with caught-yourself examples."],
      ["favorite-metaphors", "Favorite metaphors", "Recurring images (last moat, team-of-skills, 12-to-2)."],
      ["how-you-open-posts", "How you open posts", "First-line patterns specifically for LinkedIn / X / Insta."],
      ["how-you-close-posts", "How you close posts", "Last-line and CTA patterns for posts."],
      ["how-you-open-emails", "How you open emails", "Subject lines + opening sentences."],
      ["how-you-close-emails", "How you close emails", "Sign-offs, last-sentence CTAs, P.S. patterns."],
      ["how-you-open-dms", "How you open DMs", "First-line patterns for cold + warm DMs."],
      ["how-you-close-calls", "How you close calls", "Last 5 minutes of a call: what gets named, scheduled."],
      ["email-voice", "Email voice (general)", "How emails differ from posts."],
      ["linkedin-voice", "LinkedIn voice", "Tone, length, formatting for LinkedIn specifically."],
      ["dm-voice", "DM voice", "1:1 DMs to prospects vs clients vs friends."],
      ["workshop-voice", "Workshop voice", "How you teach a live room. Energy, pauses, callbacks."],
      ["one-on-one-voice", "1:1 coaching voice", "How you talk in a coaching session vs anywhere else."],
      ["stage-keynote-voice", "Stage / keynote voice", "Adapting for a stage vs an intimate room."],
      ["pushback-patterns", "Pushback patterns", "Disagreeing with clients/prospects without losing them."],
      ["disagreement-patterns", "Disagreement patterns", "How you publicly disagree with peers/industry."],
      ["praise-patterns", "Praise patterns", "Specific, earned. Never sycophantic. Examples."],
      ["read-aloud-test", "The read-aloud test", "Your final check before shipping anything written."],
    ],
  },
  {
    macro: "03-positioning-brand",
    title: "Positioning & Brand",
    description: "What Purely Personal is, the category it owns, who it is not.",
    items: [
      ["category-you-own", "The category you own", "Personal-branding agency for founders, AI-powered. The full claim."],
      ["one-line-pitch", "One-line pitch", "The compressed version. Multiple working drafts."],
      ["three-line-pitch", "Three-line pitch", "The mid-form pitch for a homepage or first DM."],
      ["paragraph-pitch", "Paragraph pitch", "The full pitch for a sales page or deck."],
      ["anti-positioning", "Anti-positioning", "Everything you actively are NOT."],
      ["the-shift-you-sell", "The shift you sell", "Before/after for the founder."],
      ["enemies", "Enemies", "Patterns, behaviors, archetypes you stand against."],
      ["proof-you-lean-on", "Proof you lean on", "Client wins, workshops run, founders taught."],
      ["vs-ghostwriters", "vs Ghostwriters", "Why a founder picks you instead."],
      ["vs-agencies", "vs Agencies", "Why a founder picks you instead."],
      ["vs-consultants", "vs Consultants", "Why a founder picks you instead."],
      ["vs-diy", "vs DIY", "Why a founder doesn't just do it themselves."],
      ["vs-chatgpt-alone", "vs ChatGPT alone", "Why your system beats one chat."],
      ["vs-other-ai-consultants", "vs Other AI consultants", "Why you're not just another AI guy."],
      ["the-moat", "The moat", "Why this can't be cloned."],
      ["category-narrative-arc", "Category narrative arc", "The story you tell about the category over time."],
      ["brand-voice-rules", "Brand voice rules", "Tone of Purely Personal as a brand entity (vs Danny personally)."],
      ["visual-identity-choices", "Visual identity choices", "Colors, type, layout decisions and why."],
    ],
  },
  {
    macro: "04-offers-pricing",
    title: "Offers & Pricing",
    description: "How Danny constructs offers, prices them, closes them.",
    items: [
      ["pricing-philosophy", "Pricing philosophy", "How you think about price relative to outcome + time."],
      ["offer-architecture", "Offer architecture", "Big Promise / Risk / Speed / Stack / Scarcity in practice."],
      ["risk-reversal-patterns", "Risk reversal patterns", "Guarantee styles you use vs reject."],
      ["what-you-charge-for", "What you charge for", "Outcomes, transformations, working systems."],
      ["what-you-refuse-to-charge-for", "What you refuse to charge for", "Effort, time, theory, deliverables you won't be measured on."],
      ["how-you-discount", "How you discount (or don't)", "When you flex price and when you walk away."],
      ["handling-too-expensive", "Handling \"too expensive\"", "Actual scripts/reframes for price objections."],
      ["handling-payment-plans", "Handling payment plan asks", "When you offer them, when you don't."],
      ["workshop-offer", "Workshop offer", "The shape. What ships in session 1."],
      ["one-on-one-offer", "1:1 coaching offer", "Scope, cadence, end state."],
      ["one-on-one-advanced-offer", "1:1 advanced offer", "What the advanced tier adds and why people upgrade."],
      ["group-cohort-offer", "Group / cohort offer", "Multi-person delivery shape."],
      ["custom-bespoke-offer", "Custom / bespoke offer", "When you build off-menu and how you scope it."],
      ["upsell-patterns", "Upsell patterns", "1:1 → group, workshop → 1:1, etc."],
      ["cross-sell-patterns", "Cross-sell patterns", "Adjacent offers to active clients."],
      ["renewal-patterns", "Renewal patterns", "How clients re-engage."],
      ["guarantee-patterns", "Guarantee patterns", "Specific guarantees you've used and their results."],
      ["scarcity-patterns", "Scarcity patterns", "Capacity-based scarcity (real, not fake urgency)."],
      ["bonus-stacks", "Bonus stacks", "What you stack in, how you frame it."],
      ["pricing-experiments-results", "Pricing experiments + results", "Specific price tests + the data."],
    ],
  },
  {
    macro: "05-content-marketing",
    title: "Content & Marketing",
    description: "Your content engine — LinkedIn-first, AI-amplified, pipeline-focused.",
    items: [
      ["linkedin-content-strategy", "LinkedIn content strategy (overall)", "The full strategy. Themes, funnel, cadence."],
      ["posting-cadence", "Posting cadence", "How many, when, why."],
      ["hook-patterns-by-archetype", "Hook patterns by archetype", "Story / contrarian / framework / lesson hooks with examples."],
      ["post-structure-story", "Post structure: story", "The narrative post template."],
      ["post-structure-framework", "Post structure: framework", "The save-bait framework post template."],
      ["post-structure-hot-take", "Post structure: hot take", "The contrarian opinion template."],
      ["post-structure-lesson", "Post structure: lesson from client", "The lesson-anonymized template."],
      ["post-structure-decision", "Post structure: decision I made", "The vulnerable behind-the-scenes template."],
      ["post-structure-before-after", "Post structure: before / after", "The transformation template."],
      ["invisibility-diagnostic-practice", "Invisibility Diagnostic in practice", "Worked scoring examples."],
      ["ctas-that-converted", "CTAs that converted", "Specific call-to-action lines that booked calls."],
      ["ctas-you-reject", "CTAs you reject", "CTAs that scream desperation or AI."],
      ["carousel-cover-hooks", "Carousel cover hooks", "First-slide patterns."],
      ["carousel-mid-transitions", "Carousel mid-slide transitions", "How you keep them swiping."],
      ["carousel-cta-slides", "Carousel CTA slides", "Last-slide patterns."],
      ["video-hook-patterns", "Video hook patterns", "First 3 seconds of short-form video."],
      ["newsletter-structure", "Newsletter structure", "Your email newsletter pattern."],
      ["cold-dm-patterns", "Cold DM patterns", "Opening, follow-up, soft close."],
      ["warm-dm-patterns", "Warm DM patterns", "Follow-up after a like, comment, share."],
      ["repurposing-flow", "Repurposing flow", "1 idea → 5 pieces across channels."],
      ["best-performing-posts-archive", "Best-performing posts (archive)", "Posts that booked calls. The patterns behind them."],
      ["worst-performing-patterns", "Worst-performing patterns", "What flopped and why. Never again."],
      ["audience-signals-watched", "Audience signals you watch", "Metrics, comments, DMs you actually act on."],
      ["comment-reply-patterns", "Comment reply patterns", "How you reply to comments to drive DMs."],
      ["repost-vs-original-ratio", "Repost vs original ratio", "How much you share others vs create."],
      ["weekly-post-cadence-plan", "Weekly cadence plan", "Which days, which post types, why."],
      ["sunday-monday-strategy", "Sunday/Monday strategy", "Specific weekend/Monday-morning patterns."],
      ["engagement-vs-pipeline-tracking", "Engagement vs pipeline tracking", "Likes are not the goal. Calls are."],
    ],
  },
  {
    macro: "06-personal-branding-coaching",
    title: "Personal Branding Coaching (1:1)",
    description: "The 1:1 PB engagement — your biggest service line.",
    items: [
      ["pb-onboarding-script", "1:1 PB onboarding script", "From contract to kickoff. The exact flow."],
      ["first-call-structure", "First call structure", "Agenda, questions, outputs of session 1."],
      ["voice-profile-extraction", "Voice profile extraction process", "How you build a Voice DNA doc with the client."],
      ["icp-extraction", "ICP extraction process", "How you build the ICP brief with them."],
      ["positioning-extraction", "Positioning extraction process", "How you arrive at their one-line positioning."],
      ["stuck-on-positioning-playbook", "Stuck on positioning playbook", "When a client can't articulate what they do, the moves."],
      ["stuck-on-confidence-playbook", "Stuck on confidence playbook", "When they know but won't say it publicly."],
      ["stuck-on-execution-playbook", "Stuck on execution playbook", "When the plan is right but nothing ships."],
      ["stuck-on-identity-playbook", "Stuck on identity playbook", "When they don't know who they are as a brand."],
      ["seven-day-breakthrough-pattern", "7-day breakthrough pattern", "What produces a fast win."],
      ["thirty-day-plateau-pattern", "30-day plateau pattern", "When momentum stalls and the fix."],
      ["session-arc-1-3-early", "Session arc: 1-3 (early)", "What happens in the opening sessions."],
      ["session-arc-4-6-mid", "Session arc: 4-6 (mid)", "What deepens mid-engagement."],
      ["session-arc-7-plus-advanced", "Session arc: 7+ (advanced / renewal)", "What advanced sessions tackle."],
      ["reframe-techniques", "Reframe techniques", "Specific reframes that break client paralysis."],
      ["pushing-back-without-losing-client", "Pushing back without losing them", "Hard truths, said well."],
      ["answer-vs-question-when", "When to answer vs ask", "Coaching vs consulting in the same call."],
      ["handling-clients-bad-idea", "Handling a client's bad idea", "How you say no without crushing them."],
      ["handling-clients-good-idea", "Handling a client's good idea", "When they out-think you, what you do."],
      ["transformation-moment-recipe", "Transformation moment recipe", "Conditions that produce a breakthrough."],
      ["renewal-conversation", "Renewal conversation script", "The 'continue or graduate' talk."],
      ["graduation-conversation", "Graduation conversation script", "How you end an engagement well."],
    ],
  },
  {
    macro: "07-workshops-group-delivery",
    title: "Workshops & Group Delivery",
    description: "Your live group teaching — workshops, cohorts, webinars.",
    items: [
      ["workshop-offer-architecture", "Workshop offer architecture", "What makes a workshop sell."],
      ["pre-workshop-setup", "Pre-workshop setup", "Email sequence, attendee prep, room setup."],
      ["workshop-opening-10min", "Workshop opening (first 10 min)", "How you seize attention immediately."],
      ["interactive-frame", "The interactive frame", "Making 20 people participate, not consume."],
      ["teach-apply-share-rhythm", "Teach → apply → share rhythm", "The 3-beat structure of every section."],
      ["in-room-outcome-rule", "The in-room outcome rule", "Every workshop ships a real asset by end."],
      ["handling-dominant-participant", "Handling a dominant participant", "Specific moves to redistribute air time."],
      ["handling-silent-participant", "Handling a silent participant", "Bringing them in without forcing."],
      ["energy-management-during-delivery", "Energy management during delivery", "2-hour delivery without crashing."],
      ["tech-setup-for-workshops", "Tech setup for workshops", "Zoom/screen/audio/lighting choices."],
      ["post-workshop-followup", "Post-workshop follow-up sequence", "What goes out after, when, why."],
      ["workshop-to-oneonone-conversion", "Workshop → 1:1 conversion", "How attendees become 1:1 clients."],
      ["workshop-to-cohort-conversion", "Workshop → cohort conversion", "How attendees join group programs."],
      ["second-cohort-pattern", "The 'second cohort' pattern", "What you change between cohort 1 and cohort 2."],
      ["pricing-experiments-cohorts", "Pricing experiments across cohorts", "Specific tests and results."],
      ["common-attendee-archetypes", "Common attendee archetypes", "The 3-5 types who show up in every cohort."],
    ],
  },
  {
    macro: "08-sales-discovery",
    title: "Sales & Discovery",
    description: "How prospects become clients. The actual sales mechanics.",
    items: [
      ["discovery-call-structure", "Discovery call structure", "Your full sales call flow."],
      ["qualifying-questions", "Qualifying questions", "Specific questions that surface fit."],
      ["disqualifying-questions", "Disqualifying questions", "Questions that catch the wrong-fit early."],
      ["setting-the-frame-60s", "Setting the frame in 60 seconds", "How you open and command the call."],
      ["handling-need-to-think", "Handling 'I need to think about it'", "The reframe + next step."],
      ["handling-get-back-next-week", "Handling 'I'll get back next week'", "Soft-close move."],
      ["handling-send-proposal", "Handling 'Send me a proposal'", "When you do, when you refuse."],
      ["handling-too-expensive", "Handling 'too expensive'", "Reframe + value re-anchor."],
      ["handling-talk-to-partner", "Handling 'I'll talk to my partner'", "Who really decides + next-step move."],
      ["cold-prospect-arc", "Cold prospect arc", "From first DM to closed deal."],
      ["warm-prospect-arc", "Warm prospect arc", "Engaged-with-content → closed."],
      ["referred-prospect-arc", "Referred prospect arc", "Came from a referral → closed."],
      ["repeat-client-arc", "Repeat client arc", "Existing client → new engagement."],
      ["common-objections-scripts", "Common objections + scripts", "The 5-7 objections you get + how you handle each."],
      ["closing-the-call-sequence", "Closing the call sequence", "Last 3-5 min."],
      ["follow-up-after-no-decision", "Follow-up after no-decision", "Email/DM cadence after a maybe."],
      ["stay-close-long-cycle", "Stay-close play (long cycle)", "Keeping a prospect warm for months."],
      ["sales-metrics-tracked", "Sales metrics you track", "Conversion rates, deal sizes, cycle time."],
    ],
  },
  {
    macro: "09-onboarding-engagement",
    title: "Onboarding & Engagement",
    description: "What happens after a client says yes — the full lifecycle.",
    items: [
      ["day-0-contract-to-kickoff", "Day 0: contract → kickoff", "What happens in the first 24 hours."],
      ["day-1-welcome-checklist", "Day 1: welcome email + asset checklist", "First email + asks."],
      ["day-7-first-session-arc", "Day 7: first session arc", "What ships by end of session 1."],
      ["week-2-4-rhythm", "Week 2-4 rhythm", "Cadence and what each session covers."],
      ["month-2-3-depth", "Month 2-3 depth", "When the engagement gets serious."],
      ["month-4-plus-renewal", "Month 4+: graduation / renewal", "Closing or extending."],
      ["voice-sample-collection", "Voice sample collection", "How you get 5-10 writing samples efficiently."],
      ["how-you-do-the-audit", "How you do the audit", "Profile + content + offer audit at the start."],
      ["setting-expectations", "Setting expectations", "What clients should and shouldn't expect."],
      ["handling-scope-creep", "Handling scope creep", "Clear lines, clean conversations."],
      ["handling-not-working-moment", "Handling 'this isn't working'", "When momentum stalls mid-engagement."],
      ["internal-client-docs", "Internal documentation per client", "Notion / Obsidian / Loom — what lives where."],
      ["tools-per-engagement", "Tools per engagement", "The standard tech stack per client."],
      ["graduation-ritual", "The graduation / closeout ritual", "How you end engagements well."],
    ],
  },
  {
    macro: "10-strategy-sessions",
    title: "Strategy Sessions",
    description: "Standalone strategic advisory work — different from coaching.",
    items: [
      ["100-min-strategy-format", "The '100-min strategy' format", "Your standard standalone session shape."],
      ["where-are-you-stuck-diagnostic", "The 'where are you stuck' diagnostic", "Opening diagnostic question set."],
      ["10x-look-like-reframe", "The 'what would 10x look like' reframe", "Forcing big-picture thinking."],
      ["strategic-vs-tactical-when", "Strategic vs tactical: when to apply", "Naming the level of the question."],
      ["kill-project-framework", "The 'kill the project' decision", "When to walk away."],
      ["double-down-framework", "The 'double down' decision", "When to amplify."],
      ["hire-vs-diy-framework", "The 'hire vs DIY' framework", "When solo > delegated, and vice versa."],
      ["raise-prices-framework", "The 'raise prices' framework", "When + how."],
      ["narrow-icp-framework", "The 'narrow your ICP' framework", "When the audience is too broad."],
      ["expand-offer-framework", "The 'expand the offer' framework", "When the product needs more."],
      ["build-a-system-framework", "The 'build a system' framework", "When to systematize."],
      ["strategy-session-notes", "Notes you take during sessions", "Your live note-taking style."],
    ],
  },
  {
    macro: "11-ai-stack-workflows",
    title: "AI Stack & Workflow Systems",
    description: "The technical heart — your tools, prompts, skills, workflows.",
    items: [
      ["full-stack", "The full stack (every tool)", "Top-to-bottom what you use and why."],
      ["claude-over-gpt", "Why Claude over GPT", "Specific reasons for your model preference."],
      ["obsidian-over-notion", "Why Obsidian over Notion", "Why markdown + local files wins for you."],
      ["n8n-over-zapier", "Why n8n / Make over Zapier", "The automation tool choice."],
      ["ai-team-not-tool-doctrine", "'AI is a team, not a tool' doctrine", "The defining principle."],
      ["seven-skill-library", "The 7-skill Claude library", "Content / Writer / Designer / Editor / Analyst / Prospector / DM Writer."],
      ["designing-a-claude-skill", "Designing a Claude Skill", "What makes a skill work vs fail."],
      ["prompt-patterns-master", "Master prompt patterns", "Repeatable structures you reuse."],
      ["voice-dna-building-process", "Voice DNA building process", "How you build a Voice DNA doc end-to-end."],
      ["icp-brief-building-process", "ICP brief building process", "How you build the ICP doc."],
      ["skill-testing-iteration", "Skill testing / iteration loop", "How you refine a skill over time."],
      ["workflows-automated", "Workflows you've automated", "Real before/after of automated work."],
      ["workflows-refused", "Workflows you refuse to automate", "Manual work you keep on purpose."],
      ["12-to-2-in-practice", "12-to-2 in practice", "Real before/after of compressing marketing time."],
      ["vault-organization", "Vault organization", "How your Obsidian vault is structured."],
      ["daily-review-ritual", "Daily review ritual", "End-of-day routine."],
      ["weekly-review-ritual", "Weekly review ritual", "Friday/Monday pattern."],
      ["monthly-retro-ritual", "Monthly retro ritual", "Big-picture review cadence."],
      ["ai-tools-rejected", "AI tools you've rejected", "What you tried and dropped, why."],
      ["what-ai-cant-replace", "What AI can't replace", "The founder's own work."],
      ["what-ai-should-replace", "What AI should replace", "Low-leverage manual work AI eats."],
      ["cost-value-calculus", "Cost vs value calculus for AI tools", "How you decide what's worth paying for."],
      ["whats-next-in-ai", "What's next in AI you're watching", "Tools, models, patterns you're tracking."],
      ["claude-code-workflow", "The Claude Code workflow", "How you build with Claude Code specifically."],
    ],
  },
  {
    macro: "12-operations-team",
    title: "Operations & Team",
    description: "How the business runs day-to-day. People, process, norms.",
    items: [
      ["solo-vs-team-philosophy", "Solo vs team philosophy", "Why you stay lean (or don't)."],
      ["when-youd-hire", "When you'd hire", "The threshold for adding a person."],
      ["who-youd-hire-first", "Who you'd hire first", "The role + the profile."],
      ["contracts-sops", "Contracts & SOPs", "Templates you use, where they live."],
      ["communication-norms", "Communication norms", "Slack/email/calls rules."],
      ["calendar-management", "Calendar management", "How you protect deep work."],
      ["meeting-rhythms", "Meeting rhythms", "What recurring meetings exist + why."],
      ["decision-logs", "Decision logs", "Where you record key decisions and rationale."],
      ["kpi-dashboard", "KPI dashboard", "Numbers you track weekly."],
      ["quarterly-okr-pattern", "Quarterly OKR pattern", "How you plan quarters."],
      ["weekly-priority-ritual", "The 'weekly priority' ritual", "Monday-morning anchor habit."],
      ["documentation-standards", "Documentation standards", "What gets written down, how."],
      ["ops-tools", "Tools for ops", "Notion / Obsidian / Linear / etc."],
      ["internal-disagreements", "Handling internal disagreements", "When team disagrees."],
    ],
  },
  {
    macro: "13-cash-pricing-economics",
    title: "Cash, Pricing, & Economics",
    description: "Your financial thinking — revenue mix, margins, decisions about money.",
    items: [
      ["revenue-mix", "Revenue mix", "Workshop / 1:1 / cohort / custom — % breakdown."],
      ["cash-flow-philosophy", "Cash flow philosophy", "How you think about runway."],
      ["save-rate", "Save rate", "What % you keep."],
      ["reinvestment-rate", "Reinvestment rate", "What % goes back into the business."],
      ["subscription-vs-project-pricing", "Subscription vs project pricing", "When recurring revenue makes sense."],
      ["cross-border-considerations", "Currency / cross-border considerations", "Operating internationally."],
      ["tax-strategy", "Tax strategy", "High-level approach (not advice)."],
      ["accountant-relationship", "Accountant relationship", "What you outsource, what you don't."],
      ["major-financial-decisions", "Major financial decisions made", "The 5-10 big calls + outcomes."],
      ["lessons-low-cash-months", "Lessons from low-cash months", "What you learned in the lean times."],
      ["lessons-high-cash-months", "Lessons from high-cash months", "What you learned in the abundant times."],
      ["what-money-buys", "What money buys you", "Time, options, optionality — concrete examples."],
    ],
  },
  {
    macro: "14-mentors-influences",
    title: "Mentors & Intellectual Influences",
    description: "Who shaped your thinking. What you took from each.",
    items: [
      ["taki-moore", "Taki Moore — Black Belt, Offer Diamond", "What you took from Taki."],
      ["alex-hormozi", "Alex Hormozi — $100M Offers", "What you took from Hormozi."],
      ["donald-miller-storybrand", "Donald Miller — StoryBrand", "What you took from StoryBrand."],
      ["nuseir-yassin", "Nuseir Yassin — Nas Academy, plain English", "What you took from Nuseir."],
      ["bible-scripture", "The Bible / scripture / faith", "How faith shapes your business thinking."],
      ["other-books", "Other books that shaped you", "The reading list that mattered."],
      ["other-operators", "Other operators / founders you study", "Who you watch + what for."],
      ["lessons-from-each-applied", "Lessons from each you apply", "Per-mentor: the one thing you do."],
      ["lessons-from-each-rejected", "Lessons from each you've rejected", "Per-mentor: what didn't fit you."],
      ["reading-rhythm", "Reading rhythm", "How and when you consume new ideas."],
      ["note-taking-on-books", "Note-taking on books", "What you capture + where."],
      ["single-best-lesson-per-mentor", "Single best lesson per mentor", "If you had to keep one thing from each."],
      ["your-teaching-tree", "Your teaching tree", "People you've taught who now teach others."],
      ["mentors-youve-outgrown", "Mentors you've outgrown", "Who shaped you then but no longer applies."],
    ],
  },
  {
    macro: "15-decisions-library",
    title: "Decisions Library",
    description: "Real decisions you made + the outcomes. Not opinions — actual choices.",
    items: [
      ["purely-personal-naming", "The Purely Personal naming decision", "Why this name + alternatives considered."],
      ["go-ai-first", "The 'go AI-first' decision", "When you committed to the AI category."],
      ["stop-ghostwriting", "The 'stop ghostwriting' decision", "If/when you stopped writing for others."],
      ["raise-prices-each-major", "The 'raise prices' decisions", "Every major price jump + result."],
      ["say-no-to-enterprise", "The 'say no to enterprise' decision", "Why you avoid procurement cycles."],
      ["move-to-finland", "The 'move to / stay in Finland' decision", "Why operating from there."],
      ["build-signal-app", "The 'build Signal app' decision", "Why build the hyperlearning platform."],
      ["start-maven-course", "The 'start the Maven course' decision", "Why teach at scale."],
      ["workshop-frequency-decisions", "Workshop frequency decisions", "Monthly cadence — why that pace."],
      ["tooling-decisions", "Tooling decisions", "Each major tool choice + reason."],
      ["hiring-decisions", "Hiring decisions", "Each person hired + why."],
      ["bookkeeping-legal-decisions", "Bookkeeping / legal decisions", "Big admin choices made."],
      ["major-content-pivots", "Major content pivots", "When you changed what you post about."],
      ["major-positioning-pivots", "Major positioning pivots", "When the category claim shifted."],
      ["decisions-youd-reverse", "Decisions you'd reverse if you could", "Honest hindsight."],
      ["the-nas-academy-chapter", "The Nas Academy chapter", "What that was + what you took from it."],
    ],
  },
];

/* --------------------------------------------------------------------------
 * .env.local loader
 * -------------------------------------------------------------------------- */

async function loadEnv() {
  try {
    const txt = await fs.readFile(path.resolve(".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* fine */
  }
}

/* --------------------------------------------------------------------------
 * Templates
 * -------------------------------------------------------------------------- */

function escape(s) {
  return String(s).replace(/"/g, '\\"');
}

function frontmatter(slug, title, macro, macroTitle, description) {
  return `---
title: "${escape(title)}"
macro: "${escape(macroTitle)}"
slug: ${slug}
tags: [ai-danny, knowledge, ${macro}]
status: scaffolded
last_distilled: null
description: "${escape(description)}"
---`;
}

function body(title, description) {
  return `# ${title}

**Status:** scaffolded · awaiting distillation.

## What this captures

${description}

## After distillation

3 to 7 specific statements in Danny's voice, each citing a vault note. Written by the synthesis pipeline using the MASTER prompt.

---

<!--::DANNY-DISTILL-START::-->
<!--::DANNY-DISTILL-END::-->
`;
}

function indexBody(taxonomy) {
  const total = taxonomy.reduce((a, m) => a + m.items.length, 0);
  let out = `---
title: Knowledge Map — INDEX
tags: [ai-danny, knowledge, index]
---

# Daniel Paul — Knowledge Map

A compressed taxonomy of Danny's thinking, extracted from his vault.

**${taxonomy.length} macro categories · ${total} sub-categories**

`;
  for (const m of taxonomy) {
    out += `\n## ${m.title} (${m.items.length})\n\n_${m.description}_\n\n`;
    for (const [slug, title, desc] of m.items) {
      out += `- [[${slug}|${title}]] — ${desc}\n`;
    }
  }
  out += `\n---\n\nGenerated by \`scripts/scaffold-knowledge.mjs\`. Re-run anytime; existing files are preserved (unless \`--clean\` is passed).\n`;
  return out;
}

/* --------------------------------------------------------------------------
 * Cleanup helper — removes orphaned files no longer in the taxonomy
 * -------------------------------------------------------------------------- */

async function rmrf(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {}
}

/* --------------------------------------------------------------------------
 * Main
 * -------------------------------------------------------------------------- */

async function main() {
  await loadEnv();
  const vault = process.env.VAULT_PATH;
  if (!vault) {
    console.error("VAULT_PATH not set in .env.local");
    process.exit(1);
  }
  const root = path.join(vault, "_ai-danny", "knowledge");
  const clean = process.argv.includes("--clean");

  if (clean) {
    console.log(`Cleaning ${root}…`);
    await rmrf(root);
  }

  await fs.mkdir(root, { recursive: true });

  let created = 0;
  let skipped = 0;

  for (const macro of TAXONOMY) {
    const macroDir = path.join(root, macro.macro);
    await fs.mkdir(macroDir, { recursive: true });

    // Macro README
    const readme = path.join(macroDir, "_README.md");
    try {
      await fs.access(readme);
      skipped++;
    } catch {
      await fs.writeFile(
        readme,
        `---
title: "${macro.title} — overview"
tags: [ai-danny, knowledge, ${macro.macro}, overview]
---

# ${macro.title}

${macro.description}

## Sub-categories in this macro (${macro.items.length})

${macro.items.map(([slug, title]) => `- [[${slug}|${title}]]`).join("\n")}
`
      );
      created++;
    }

    // Sub-category files
    for (const [slug, title, description] of macro.items) {
      const fp = path.join(macroDir, `${slug}.md`);
      try {
        await fs.access(fp);
        skipped++;
        continue;
      } catch {
        const content = `${frontmatter(slug, title, macro.macro, macro.title, description)}\n\n${body(title, description)}`;
        await fs.writeFile(fp, content);
        created++;
      }
    }
  }

  // Top-level INDEX.md (always overwritten so it stays in sync with taxonomy)
  const indexPath = path.join(root, "INDEX.md");
  await fs.writeFile(indexPath, indexBody(TAXONOMY));

  const total = TAXONOMY.reduce((a, m) => a + m.items.length, 0);
  console.log(`Knowledge scaffold complete.`);
  console.log(`  Root: ${root}`);
  console.log(`  Macros: ${TAXONOMY.length}`);
  console.log(`  Sub-categories: ${total}`);
  console.log(`  Files created: ${created}`);
  console.log(`  Files skipped (already existed): ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
