import { createAdminClient } from "./supabase/admin";
import { embed, embedOne } from "./embeddings";

export type Memory = {
  id: string;
  text: string;
  kind: string;
  similarity?: number;
  created_at: string;
};

export type ExtractedMemory = {
  text: string;
  kind: "fact" | "preference" | "context" | "commitment";
};

/* ---------------------------------------------------------------------------
 * Search relevant memories for an incoming user message.
 * ------------------------------------------------------------------------ */

export async function searchMemories(
  userId: string,
  query: string,
  limit = 6
): Promise<Memory[]> {
  if (!query?.trim()) return [];
  try {
    const [qVec] = await embed([query]);
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: qVec,
      target_user_id: userId,
      match_count: limit,
      similarity_threshold: 0.4,
    });
    if (error) {
      console.error("[memories] search failed:", error);
      return [];
    }
    return (data as Memory[]) || [];
  } catch (err) {
    console.error("[memories] search exception:", err);
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Store new memories (embeds + inserts + dedupes against very similar existing).
 * ------------------------------------------------------------------------ */

export async function storeMemories(
  userId: string,
  memories: ExtractedMemory[]
): Promise<number> {
  if (memories.length === 0) return 0;
  try {
    const vectors = await embed(memories.map((m) => m.text));
    const rows = memories.map((m, i) => ({
      user_id: userId,
      text: m.text.trim(),
      kind: m.kind,
      embedding: vectors[i],
    }));
    const supabase = createAdminClient();

    // Dedupe: for each new memory, skip if a near-duplicate already exists
    let inserted = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const { data: existing } = await supabase.rpc("match_memories", {
        query_embedding: r.embedding,
        target_user_id: userId,
        match_count: 1,
        similarity_threshold: 0.9, // very similar → skip
      });
      if (existing && existing.length > 0) continue;
      const { error } = await supabase.from("memories").insert(r as any);
      if (!error) inserted++;
    }
    return inserted;
  } catch (err) {
    console.error("[memories] store exception:", err);
    return 0;
  }
}

/* ---------------------------------------------------------------------------
 * List all memories for the user (admin / management UI).
 * ------------------------------------------------------------------------ */

export async function listMemories(userId: string): Promise<Memory[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("memories")
    .select("id, text, kind, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[memories] list failed:", error);
    return [];
  }
  return (data as Memory[]) || [];
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    console.error("[memories] delete failed:", error);
    return false;
  }
  return true;
}

/* ---------------------------------------------------------------------------
 * Extraction — uses Claude to pull durable facts from an exchange.
 * ------------------------------------------------------------------------ */

const EXTRACT_SYSTEM = `You extract DURABLE memories about the user from a chat exchange.

A memory is a SHORT, STABLE fact, preference, ongoing context, or commitment that would be useful in future conversations.

GOOD examples:
- {"text": "User is building a SaaS called Signal app", "kind": "context"}
- {"text": "User prefers responses without bullet points", "kind": "preference"}
- {"text": "User is preparing for a workshop on December 12th", "kind": "commitment"}
- {"text": "User's wife is named X", "kind": "fact"}
- {"text": "User runs Purely Personal, a personal branding agency", "kind": "context"}

BAD examples — DO NOT extract:
- Generic AI advice you gave the user
- Anything the assistant said
- Trivial small talk
- One-off questions about how to do something
- Things that change frequently

Rules:
- Use "user" as the subject, not "you" or "I"
- Each memory ≤ 120 characters
- Return [] if nothing durable was revealed
- Output STRICT JSON ONLY, no preamble. Format: an array of { text, kind } objects.

Allowed "kind" values: "fact" | "preference" | "context" | "commitment".`;

export async function extractMemoriesFromExchange(
  userMessage: string,
  assistantMessage: string
): Promise<ExtractedMemory[]> {
  if (!userMessage?.trim() || !assistantMessage?.trim()) return [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  try {
    // Use Haiku for extraction — much cheaper than Sonnet, plenty smart enough
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: EXTRACT_SYSTEM,
        messages: [
          {
            role: "user",
            content: `USER: ${userMessage.slice(0, 2000)}\n\nASSISTANT: ${assistantMessage.slice(0, 2000)}\n\nExtract memories as JSON.`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      // Try a known-good model id as fallback (some accounts don't have Haiku 4.5 yet)
      if (res.status === 404 || body.includes("model")) {
        return await extractWithSonnetFallback(userMessage, assistantMessage);
      }
      console.error("[memories] extract failed:", res.status, body.slice(0, 200));
      return [];
    }
    const j = await res.json();
    const text = (j.content?.find?.((c: any) => c.type === "text") as any)?.text || "";
    return parseExtractionJson(text);
  } catch (err) {
    console.error("[memories] extract exception:", err);
    return [];
  }
}

async function extractWithSonnetFallback(
  userMessage: string,
  assistantMessage: string
): Promise<ExtractedMemory[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        system: EXTRACT_SYSTEM,
        messages: [
          {
            role: "user",
            content: `USER: ${userMessage.slice(0, 2000)}\n\nASSISTANT: ${assistantMessage.slice(0, 2000)}\n\nExtract memories as JSON.`,
          },
        ],
      }),
    });
    if (!res.ok) return [];
    const j = await res.json();
    const text = (j.content?.find?.((c: any) => c.type === "text") as any)?.text || "";
    return parseExtractionJson(text);
  } catch {
    return [];
  }
}

function parseExtractionJson(text: string): ExtractedMemory[] {
  // Sometimes the model wraps JSON in markdown — tolerate it.
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.text === "string" && x.text.trim())
      .slice(0, 5)
      .map((x) => ({
        text: String(x.text).slice(0, 240).trim(),
        kind: ["fact", "preference", "context", "commitment"].includes(x.kind)
          ? x.kind
          : "fact",
      }));
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Extraction — meeting transcripts. Uses a skill file as the system prompt so
 * the rules live in the vault (editable like any other note).
 * ------------------------------------------------------------------------ */

export async function extractMemoriesFromTranscript(
  meetingTitle: string,
  meetingDate: string,
  transcript: string,
  systemPrompt: string
): Promise<ExtractedMemory[]> {
  if (!transcript?.trim() || !systemPrompt?.trim()) return [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  // Transcripts can be long. Cap at ~50k chars (~12k tokens) to stay safe.
  const cappedTranscript = transcript.slice(0, 50_000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `MEETING: ${meetingTitle}\nDATE: ${meetingDate}\n\n${cappedTranscript}\n\nReturn the JSON array now.`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 || body.includes("model")) {
        // Sonnet fallback
        return await extractFromTranscriptWithSonnet(
          meetingTitle,
          meetingDate,
          cappedTranscript,
          systemPrompt
        );
      }
      console.error("[memories] transcript extract failed:", res.status, body.slice(0, 200));
      return [];
    }
    const j = await res.json();
    const text = (j.content?.find?.((c: any) => c.type === "text") as any)?.text || "";
    return parseExtractionJson(text);
  } catch (err) {
    console.error("[memories] transcript extract exception:", err);
    return [];
  }
}

async function extractFromTranscriptWithSonnet(
  meetingTitle: string,
  meetingDate: string,
  transcript: string,
  systemPrompt: string
): Promise<ExtractedMemory[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `MEETING: ${meetingTitle}\nDATE: ${meetingDate}\n\n${transcript}\n\nReturn the JSON array now.`,
          },
        ],
      }),
    });
    if (!res.ok) return [];
    const j = await res.json();
    const text = (j.content?.find?.((c: any) => c.type === "text") as any)?.text || "";
    return parseExtractionJson(text);
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Build the system-prompt memory block to inject into the agent context.
 * ------------------------------------------------------------------------ */

export function buildMemoryPreamble(memories: Memory[]): string {
  if (memories.length === 0) return "";
  const list = memories
    .map((m, i) => `  ${i + 1}. (${m.kind}) ${m.text}`)
    .join("\n");
  return `

== KNOWN ABOUT THE USER ==

You have a memory of past conversations. The following facts/preferences/context were noted from prior chats. Apply them naturally — never narrate that you "remember" something or that you have memory enabled. Just use the information when relevant.

${list}
`;
}
