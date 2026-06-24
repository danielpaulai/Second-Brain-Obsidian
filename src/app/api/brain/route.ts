import { NextResponse } from "next/server";
import { buildVaultGraph, vaultConfigured } from "@/lib/brain-vault";
import { getClientBrain } from "@/lib/client-brain";

export const runtime = "nodejs";

/**
 * The brain graph for the stage / brain pages. PRIMARY source is the founder's
 * full Obsidian vault in Supabase pgvector (the new setup); falls back to the
 * bundled business-doc brain only when Supabase isn't configured or is empty.
 */
export async function GET() {
  try {
    if (vaultConfigured().ok) {
      const { graph, stats } = await buildVaultGraph();
      if (graph.nodes.length) return NextResponse.json({ graph, stats });
    }
    // Fallback: build the brain locally from the bundled business docs.
    const brain = await getClientBrain();
    if (brain && brain.graph.nodes.length) return NextResponse.json(brain);
    return NextResponse.json({ graph: { nodes: [], links: [], folders: [] }, stats: { notes: 0, links: 0, folders: 0 } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "brain read failed" }, { status: 500 });
  }
}
