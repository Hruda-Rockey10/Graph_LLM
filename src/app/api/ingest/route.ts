import { NextResponse } from "next/server";
import { ingestSapDataset, resetGraph } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST() {
  try {
    const wipeExisting = process.env.WIPE_GRAPH_ON_INGEST === "true";
    if (wipeExisting) {
      await resetGraph();
    }

    const result = await ingestSapDataset();
    return NextResponse.json({
      ok: true,
      message: "Ingestion completed.",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown ingestion error",
      },
      { status: 500 },
    );
  }
}
