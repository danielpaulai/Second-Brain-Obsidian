import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import type { ViewerRole } from "./privacy";

/**
 * Conversational WRITE tools for the structured brain.
 * Owner-only — team/public viewers are refused.
 *
 * Tools:
 *   logMetric       — record a daily metric value (sleep, mood, MRR, …)
 *   addTask         — add a self-assigned task/todo
 *   upsertOffer     — create or update a productized offer (set that price!)
 *   closeCommitment — mark an open commitment done
 *   addDecisionRule — capture a new heuristic / decision rule
 *
 * Spread into the chat route's tools alongside buildBrainTools:
 *   tools: { ...existingTools, ...buildBrainTools(role), ...buildBrainWriteTools(role, userId) }
 */
export function buildBrainWriteTools(viewerRole: ViewerRole, userId: string | null) {
  const refused = viewerRole !== "owner" || !userId;

  // ------------------------------------------------------------------
  // Shared helpers
  // ------------------------------------------------------------------

  function refusedPayload(toolName: string) {
    return {
      ok: false as const,
      refused: `${toolName} is owner-only. Writes to the structured brain require an authenticated owner session.`,
    };
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // ------------------------------------------------------------------
  // logMetric
  // ------------------------------------------------------------------
  const logMetric = tool({
    description:
      "Record a daily metric value for Daniel — health, fitness, finance, or business KPIs. Examples: sleep_hours=7.5, mood=8, mrr=12000, run_distance_km=5, deep_work_hours=4. If the metric key is new (not in the standard catalog), it will be auto-created. Use this whenever Daniel mentions a number he wants to track.",
    parameters: z.object({
      metric_key: z
        .string()
        .describe(
          "Snake_case metric identifier. Use standard keys where possible: sleep_hours, resting_hr, hrv, weight_kg, run_distance_km, steps, deep_work_hours, mood, mrr, cash_balance. New keys are auto-created."
        ),
      value: z.number().describe("The numeric value to record."),
      date: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD). Defaults to today."),
      label: z
        .string()
        .optional()
        .describe(
          "Human-readable label for a new metric key (only needed if metric_key is brand new). E.g. 'Caffeine intake' for metric_key='caffeine_mg'."
        ),
      category: z
        .enum(["health", "fitness", "finance", "productivity", "business", "other"])
        .optional()
        .describe("Category for a new metric key. Defaults to 'other'."),
    }),
    execute: async ({ metric_key, value, date, label, category }) => {
      if (refused) return refusedPayload("logMetric");
      const supabase = createAdminClient();
      const recordDate = date ?? today();

      // Ensure metric_definitions row exists (idempotent)
      const prettyLabel =
        label ??
        metric_key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      await supabase.from("metric_definitions").upsert(
        {
          key: metric_key,
          label: prettyLabel,
          category: category ?? "other",
        },
        { onConflict: "key", ignoreDuplicates: true }
      );

      // Upsert the daily value
      const { error } = await supabase.from("metrics").upsert(
        {
          user_id: userId,
          metric_key,
          metric_date: recordDate,
          value_num: value,
          source: "manual",
        },
        { onConflict: "user_id,metric_key,metric_date,source" }
      );

      if (error) {
        return { ok: false as const, error: error.message };
      }
      return {
        ok: true as const,
        message: `Logged ${prettyLabel}: ${value} on ${recordDate}.`,
        metric_key,
        value,
        date: recordDate,
      };
    },
  });

  // ------------------------------------------------------------------
  // addTask
  // ------------------------------------------------------------------
  const addTask = tool({
    description:
      "Add a self-assigned task or todo. Distinct from commitments (which come from meetings). Use for anything Daniel says he needs to do: 'remind me to...', 'add a task to...', 'I need to...'.",
    parameters: z.object({
      title: z.string().describe("Clear, action-oriented task title."),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Task priority. Defaults to medium."),
      due_date: z
        .string()
        .optional()
        .describe(
          "Due date as ISO date (YYYY-MM-DD). Parse natural language: 'tomorrow' → next day, 'next Monday' → correct date."
        ),
      project: z
        .string()
        .optional()
        .describe("Project or area this task belongs to, e.g. 'Purely Personal', 'Admin', 'Content'."),
    }),
    execute: async ({ title, priority, due_date, project }) => {
      if (refused) return refusedPayload("addTask");
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          title,
          priority: priority ?? "medium",
          due_date: due_date ?? null,
          project: project ?? null,
          status: "todo",
        })
        .select("id")
        .single();

      if (error) return { ok: false as const, error: error.message };
      return {
        ok: true as const,
        message: `Task added: "${title}"${due_date ? ` (due ${due_date})` : ""}.`,
        id: data.id,
        title,
        priority: priority ?? "medium",
        due_date: due_date ?? null,
        project: project ?? null,
      };
    },
  });

  // ------------------------------------------------------------------
  // upsertOffer
  // ------------------------------------------------------------------
  const upsertOffer = tool({
    description:
      "Create a new offer or update an existing one in the structured brain. Most common use: setting the price ('the workshop is €2,500'). Also updates tagline, positioning, status, notes, tier, billing. Match by name — fuzzy is fine.",
    parameters: z.object({
      name: z
        .string()
        .describe(
          "The offer name to create or update. Case-insensitive. Examples: 'LinkedIn Growth Sprint', 'Brand Authority Workshop'."
        ),
      price: z.number().optional().describe("Price (numeric). Currency set separately."),
      currency: z
        .string()
        .optional()
        .describe("ISO 4217 currency code, e.g. 'EUR', 'USD', 'GBP'. Defaults to existing or 'USD'."),
      tagline: z.string().optional().describe("One-line tagline for the offer."),
      positioning: z
        .string()
        .optional()
        .describe("The 'why this, why now, why Danny' positioning statement."),
      tier: z
        .enum(["entry", "core", "premium", "enterprise"])
        .optional()
        .describe("Offer tier."),
      billing: z
        .enum(["one_time", "monthly", "retainer", "usage"])
        .optional()
        .describe("Billing model."),
      status: z
        .enum(["active", "retired", "draft"])
        .optional()
        .describe("Offer status. Defaults to 'active' for new offers."),
      notes: z.string().optional().describe("Internal notes about this offer."),
      ideal_client: z.string().optional().describe("Who this offer is for."),
      guarantee: z.string().optional().describe("Any guarantee offered."),
    }),
    execute: async ({
      name,
      price,
      currency,
      tagline,
      positioning,
      tier,
      billing,
      status,
      notes,
      ideal_client,
      guarantee,
    }) => {
      if (refused) return refusedPayload("upsertOffer");
      const supabase = createAdminClient();

      // Look for an existing offer by name (case-insensitive)
      const { data: existing } = await supabase
        .from("offers")
        .select("id, name, price, currency, status")
        .eq("user_id", userId!)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();

      // Build the fields object — only include fields that were explicitly provided
      const fields: Record<string, unknown> = {};
      if (price !== undefined) fields.price = price;
      if (currency !== undefined) fields.currency = currency;
      if (tagline !== undefined) fields.tagline = tagline;
      if (positioning !== undefined) fields.positioning = positioning;
      if (tier !== undefined) fields.tier = tier;
      if (billing !== undefined) fields.billing = billing;
      if (status !== undefined) fields.status = status;
      if (notes !== undefined) fields.notes = notes;
      if (ideal_client !== undefined) fields.ideal_client = ideal_client;
      if (guarantee !== undefined) fields.guarantee = guarantee;

      if (existing) {
        // UPDATE
        fields.updated_at = new Date().toISOString();
        const { error } = await supabase
          .from("offers")
          .update(fields)
          .eq("id", existing.id);
        if (error) return { ok: false as const, error: error.message };
        return {
          ok: true as const,
          action: "updated" as const,
          message: `Updated offer "${existing.name}".${price !== undefined ? ` Price set to ${currency ?? existing.currency ?? "USD"} ${price}.` : ""}`,
          id: existing.id,
          name: existing.name,
          updatedFields: Object.keys(fields).filter((k) => k !== "updated_at"),
        };
      } else {
        // INSERT
        const { data: ins, error } = await supabase
          .from("offers")
          .insert({
            user_id: userId,
            name,
            status: status ?? "active",
            ...fields,
          })
          .select("id")
          .single();
        if (error) return { ok: false as const, error: error.message };
        return {
          ok: true as const,
          action: "created" as const,
          message: `Created new offer "${name}".${price !== undefined ? ` Price: ${currency ?? "USD"} ${price}.` : " No price set yet — say 'set the price to X' to add it."}`,
          id: ins.id,
          name,
        };
      }
    },
  });

  // ------------------------------------------------------------------
  // closeCommitment
  // ------------------------------------------------------------------
  const closeCommitment = tool({
    description:
      "Mark an open commitment as done. Search by keyword in the description — e.g. 'close the commitment about sending Dana the proposal'. If multiple open commitments match, returns the list so you can confirm which one.",
    parameters: z.object({
      description_fragment: z
        .string()
        .describe(
          "A keyword or phrase that appears in the commitment description. Case-insensitive. Be specific enough to match only the intended commitment."
        ),
      note: z
        .string()
        .optional()
        .describe("Optional completion note to append to the commitment description."),
    }),
    execute: async ({ description_fragment, note }) => {
      if (refused) return refusedPayload("closeCommitment");
      const supabase = createAdminClient();

      const { data: matches, error: findErr } = await supabase
        .from("commitments")
        .select("id, description, owner_side, due_date, person_id")
        .eq("user_id", userId!)
        .eq("status", "open")
        .ilike("description", `%${description_fragment}%`)
        .limit(5);

      if (findErr) return { ok: false as const, error: findErr.message };
      if (!matches || matches.length === 0) {
        return {
          ok: false as const,
          message: `No open commitments found matching "${description_fragment}". Check the exact wording with: queryDatabase → SELECT description FROM commitments WHERE status='open'.`,
        };
      }
      if (matches.length > 1) {
        return {
          ok: false as const,
          message: `${matches.length} open commitments match "${description_fragment}". Which one?`,
          matches: matches.map((m) => ({ id: m.id, description: m.description, due_date: m.due_date })),
        };
      }

      // Exactly one match — close it
      const target = matches[0];
      const updatedDescription = note
        ? `${target.description} [Done: ${note}]`
        : target.description;

      const { error: updateErr } = await supabase
        .from("commitments")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
          description: updatedDescription,
        })
        .eq("id", target.id);

      if (updateErr) return { ok: false as const, error: updateErr.message };
      return {
        ok: true as const,
        message: `Closed commitment: "${target.description}".${note ? ` Note: ${note}` : ""}`,
        id: target.id,
      };
    },
  });

  // ------------------------------------------------------------------
  // addDecisionRule
  // ------------------------------------------------------------------
  const addDecisionRule = tool({
    description:
      "Capture a new decision heuristic or rule of thumb for Daniel's decision-making library. Use when Daniel says something like 'from now on, whenever X happens, I'll do Y' or 'my rule is...' or 'I've decided that...'. These accumulate into the queryable decision engine.",
    parameters: z.object({
      situation: z
        .string()
        .describe(
          "The trigger or context for this rule. E.g. 'When a prospect asks for a discount', 'When a client misses two calls'."
        ),
      heuristic: z
        .string()
        .describe("The rule of thumb in Danny's words. Keep it punchy and first-person."),
      default_action: z
        .string()
        .optional()
        .describe("The concrete default action to take. E.g. 'Offer value-add, not a price cut.'"),
      rationale: z
        .string()
        .optional()
        .describe("Why this rule exists. The belief behind it."),
      tags: z
        .array(z.string())
        .optional()
        .describe(
          "Searchable tags, e.g. ['sales', 'pricing'], ['client-management'], ['content']."
        ),
      priority: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("1=highest priority. Used when multiple rules fire for the same situation. Default 5."),
    }),
    execute: async ({ situation, heuristic, default_action, rationale, tags, priority }) => {
      if (refused) return refusedPayload("addDecisionRule");
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("decision_rules")
        .insert({
          user_id: userId,
          situation,
          heuristic,
          default_action: default_action ?? null,
          rationale: rationale ?? null,
          tags: tags ?? [],
          priority: priority ?? 5,
        })
        .select("id")
        .single();

      if (error) return { ok: false as const, error: error.message };
      return {
        ok: true as const,
        message: `Decision rule saved: "${situation}" → "${heuristic}".`,
        id: data.id,
        situation,
        heuristic,
      };
    },
  });

  return { logMetric, addTask, upsertOffer, closeCommitment, addDecisionRule };
}
