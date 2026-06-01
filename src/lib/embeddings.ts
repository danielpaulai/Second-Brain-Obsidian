/**
 * Embeddings — gateway-first, OpenAI-direct fallback.
 *
 * Prefers AI_GATEWAY_API_KEY (Vercel AI Gateway) so we route through one key
 * with observability + provider fallback. Falls back to OPENAI_API_KEY direct.
 *
 * Model: text-embedding-3-small (1536 dim, ~$0.02/1M tokens — about $0.20
 * for a full 1,491-note vault re-index).
 */

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";
const OPENAI_URL = "https://api.openai.com/v1";
// Gateway caps each embedding request at 300K tokens. Pack batches by
// estimated token count rather than item count so 1 long note can't blow it.
const MAX_BATCH_TOKENS = 240_000;
const MAX_BATCH_ITEMS = 128;
// Heuristic: 1 token ≈ 4 chars for English text.
const estimateTokens = (s: string) => Math.ceil(s.length / 4);
export const EMBEDDING_DIM = 1536;

type EmbedTarget = {
  baseUrl: string;
  apiKey: string;
  model: string;
  label: string;
};

function gatewayTarget(): EmbedTarget | null {
  if (!process.env.AI_GATEWAY_API_KEY) return null;
  return {
    baseUrl: GATEWAY_URL,
    apiKey: process.env.AI_GATEWAY_API_KEY,
    model: "openai/text-embedding-3-small",
    label: "Vercel AI Gateway",
  };
}

function openaiTarget(): EmbedTarget | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return {
    baseUrl: OPENAI_URL,
    apiKey: process.env.OPENAI_API_KEY,
    model: "text-embedding-3-small",
    label: "OpenAI direct",
  };
}

function resolveTargets(): EmbedTarget[] {
  const targets = [gatewayTarget(), openaiTarget()].filter(Boolean) as EmbedTarget[];
  if (targets.length === 0) {
    throw new Error(
      "No AI_GATEWAY_API_KEY or OPENAI_API_KEY set. Add one to .env.local to enable semantic search."
    );
  }
  return targets;
}

async function embedBatch(texts: string[], target: EmbedTarget): Promise<number[][]> {
  const res = await fetch(`${target.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${target.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: target.model,
      input: texts,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding request failed (${target.label}): ${res.status} ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}

async function tryBatchWithFallback(
  batch: string[],
  targets: EmbedTarget[]
): Promise<number[][]> {
  let lastErr: unknown = null;
  for (const t of targets) {
    try {
      return await embedBatch(batch, t);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Fall over on rate limit (429), credit/auth issues (401/403), or provider outage (5xx).
      if (/\b(429|401|403|500|502|503|504)\b/.test(msg)) {
        console.warn(`[embeddings] ${t.label} failed (${msg.slice(0, 120)}…) — falling back`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All embedding targets failed");
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const targets = resolveTargets();
  const out: number[][] = [];

  let i = 0;
  while (i < texts.length) {
    const batch: string[] = [];
    let tokens = 0;
    while (
      i < texts.length &&
      batch.length < MAX_BATCH_ITEMS &&
      tokens + estimateTokens(texts[i]) <= MAX_BATCH_TOKENS
    ) {
      batch.push(texts[i]);
      tokens += estimateTokens(texts[i]);
      i++;
    }
    if (batch.length === 0 && i < texts.length) {
      const capped = texts[i].slice(0, MAX_BATCH_TOKENS * 4 - 100);
      batch.push(capped);
      i++;
    }
    const vecs = await tryBatchWithFallback(batch, targets);
    out.push(...vecs);
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embed([text]);
  return v;
}

export function describeEmbeddingProvider(): string {
  try {
    return resolveTargets()
      .map((t) => t.label)
      .join(" → ");
  } catch {
    return "none configured";
  }
}
