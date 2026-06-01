import { NextResponse } from "next/server";
import { reindexAll, getIndexState, isIndexReady } from "@/lib/semantic";
import { describeEmbeddingProvider } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  // Refresh in-memory state from on-disk index (handles HMR module resets).
  await isIndexReady();
  return NextResponse.json({
    ...getIndexState(),
    provider: describeEmbeddingProvider(),
  });
}

export async function POST() {
  try {
    const result = await reindexAll();
    return NextResponse.json({
      ok: true,
      ...result,
      provider: describeEmbeddingProvider(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
