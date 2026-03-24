import { NextResponse } from "next/server";
import { runCypher } from "@/lib/neo4j";

export const runtime = "nodejs";

export async function GET() {
  try {
    await runCypher("RETURN 1 AS ok");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Neo4j health check failed",
      },
      { status: 500 },
    );
  }
}
