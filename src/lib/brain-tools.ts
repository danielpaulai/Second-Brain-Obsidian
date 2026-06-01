import { tool } from "ai";
import { z } from "zod";
import { describeBrain, aiQuery } from "./structured";
import type { ViewerRole } from "./privacy";

/**
 * Structured-brain tools: let the agent learn the schema and run read-only SQL
 * against the 27 relational tables (operational + identity/knowledge).
 *
 * Spread into any tools object:
 *   tools: { ...existingTools, ...buildBrainTools(viewerRole) }
 *
 * Privacy: querying raw structured rows (clients, deals, revenue, people) is
 * OWNER-ONLY. team/public viewers are refused — they get the redacted
 * vault/knowledge paths instead. This keeps the SQL layer behind the same
 * guardrail as readNote.
 */
export function buildBrainTools(viewerRole: ViewerRole) {
  const ownerOnly = viewerRole !== "owner";

  return {
    describeBrain: tool({
      description:
        "Get the schema of Daniel's structured database (27 tables: people, meetings, commitments, deals, revenue_events, content_posts, tasks, metrics, offers, offer_objections, case_studies, icp_segments, client_problems, solutions, common_issues, frameworks, voice_rules, tone_profiles, personality_traits, decision_rules, principles, signature_phrases, stories, content_pillars, hooks, metric_definitions). ALWAYS call this first before queryDatabase so you know the exact tables/columns to query.",
      parameters: z.object({}),
      execute: async () => {
        if (ownerOnly) {
          return { refused: "The structured database is only queryable by the owner." };
        }
        const schema = await describeBrain();
        return { schema };
      },
    }),

    queryDatabase: tool({
      description:
        "Run a single READ-ONLY SQL SELECT against Daniel's structured brain and get JSON rows back. Use this for ANY aggregate or precise-fact question — counts, sums, pipeline value, overdue commitments, best content, sleep/run/finance metrics, offers, objection rebuttals, decision rules, voice rules, etc. Far cheaper and more accurate than reading vault notes. Call describeBrain first if unsure of columns. SELECT/WITH only — no writes.",
      parameters: z.object({
        sql: z
          .string()
          .describe(
            "A single PostgreSQL SELECT (or WITH ... SELECT) statement. No semicolons-as-separator, no INSERT/UPDATE/DELETE/DDL. Example: SELECT objection, rebuttal FROM offer_objections WHERE category='price';"
          ),
        purpose: z
          .string()
          .optional()
          .describe("One short phrase: what you're trying to find. For logging."),
      }),
      execute: async ({ sql }) => {
        if (ownerOnly) {
          return {
            ok: false,
            refused:
              "Direct database access is owner-only. For team/public, use queryKnowledge / queryBrain.",
          };
        }
        const result = await aiQuery(sql);
        if (!result.ok) {
          return { ok: false, error: result.error, hint: "Check table/column names with describeBrain." };
        }
        // Guardrail: keep responses token-light. Truncate very large row sets.
        const rows = result.rows.slice(0, 200);
        return {
          ok: true,
          rowCount: result.rowCount,
          truncated: result.rowCount > rows.length,
          rows,
        };
      },
    }),
  };
}
