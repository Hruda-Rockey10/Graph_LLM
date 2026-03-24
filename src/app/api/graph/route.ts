import { NextRequest, NextResponse } from "next/server";
import { loadGraph } from "@/lib/graph";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const focus = request.nextUrl.searchParams.get("focus") || undefined;
    const payload = await loadGraph(focus);
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load graph",
      },
      { status: 500 },
    );
  }
}
