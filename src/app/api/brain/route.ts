import { NextResponse } from "next/server";
import { getCachedVault } from "@/lib/vault";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { graph, notes } = await getCachedVault();
    return NextResponse.json({
      graph,
      stats: {
        notes: notes.length,
        links: graph.links.length,
        folders: graph.folders.length,
        lastEdited: Math.max(0, ...notes.map((n) => n.mtime)),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "vault read failed" },
      { status: 500 }
    );
  }
}
