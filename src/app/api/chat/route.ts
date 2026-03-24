import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardrailMessage, isDomainQuestion, isUnsafeCypher } from "@/lib/guardrails";
import { createCypherPlan, summarizeAnswer } from "@/lib/openrouter";
import { runCypher } from "@/lib/neo4j";
import { serializeRows } from "@/lib/graph";

export const runtime = "nodejs";

const bodySchema = z.object({
  question: z.string().min(3),
});

function fallbackPlan(question: string) {
  const q = question.toLowerCase();

  if (q.includes("highest") && (q.includes("billing") || q.includes("invoice"))) {
    return {
      cypher: `
MATCH (:Product)<-[:FOR_PRODUCT]-(bi:BillingItem)-[:IN_BILLING]->(b:BillingDocument)
WITH bi.material AS material, count(DISTINCT b.id) AS billingDocumentCount
RETURN material, billingDocumentCount
ORDER BY billingDocumentCount DESC
LIMIT 10
`,
      params: {},
    };
  }

  if (q.includes("broken") || q.includes("incomplete")) {
    return {
      cypher: `
MATCH (so:SalesOrder)
OPTIONAL MATCH (so)-[:HAS_ITEM]->(:SalesOrderItem)-[:DELIVERED_AS]->(:DeliveryItem)-[:BILLED_AS]->(:BillingItem)
WITH so, count(*) AS linkedCount
WHERE linkedCount = 0 OR coalesce(so.overallDeliveryStatus, '') = 'C' AND coalesce(so.overallOrdReltdBillgStatus, '') = ''
RETURN so.salesOrder AS salesOrder, so.overallDeliveryStatus AS deliveryStatus, so.overallOrdReltdBillgStatus AS billingStatus, linkedCount
LIMIT 50
`,
      params: {},
    };
  }

  const docMatch = question.match(/\b\d{6,12}\b/);
  const doc = docMatch?.[0] || "";
  return {
    cypher: `
MATCH (b:BillingDocument {id: $billingDocument})
OPTIONAL MATCH (b)<-[:IN_BILLING]-(bi:BillingItem)<-[:BILLED_AS]-(di:DeliveryItem)<-[:DELIVERED_AS]-(si:SalesOrderItem)<-[:HAS_ITEM]-(so:SalesOrder)
OPTIONAL MATCH (b)-[:POSTED_TO]->(j:JournalEntry)
RETURN b.id AS billingDocument, collect(DISTINCT so.id) AS salesOrders, collect(DISTINCT di.deliveryDocument) AS deliveries, j.accountingDocument AS accountingDocument
LIMIT 10
`,
    params: { billingDocument: doc },
  };
}

export async function POST(request: NextRequest) {
  try {
    const parsedBody = bodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ ok: false, error: "Invalid question payload." }, { status: 400 });
    }

    const question = parsedBody.data.question.trim();
    if (!isDomainQuestion(question)) {
      return NextResponse.json({
        ok: true,
        answer: guardrailMessage(),
        rows: [],
        cypher: null,
      });
    }

    let cypher = "";
    let params: Record<string, unknown> = {};

    if (process.env.OPENROUTER_API_KEY) {
      const plan = await createCypherPlan(question);
      cypher = plan.cypher;
      params = plan.params;
    } else {
      const plan = fallbackPlan(question);
      cypher = plan.cypher;
      params = plan.params;
    }

    if (isUnsafeCypher(cypher)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Generated query was blocked by guardrails.",
        },
        { status: 400 },
      );
    }

    const result = await runCypher<{ records: Array<{ toObject: () => Record<string, unknown> }> }>(
      cypher,
      params,
    );
    const rows = serializeRows(result.records);

    let answer = "";
    if (process.env.OPENROUTER_API_KEY) {
      answer = await summarizeAnswer(question, rows);
    } else {
      answer = rows.length
        ? `Found ${rows.length} matching result row(s). Configure OPENROUTER_API_KEY to enable richer natural-language summaries.`
        : "No matching records were found for your question.";
    }

    return NextResponse.json({
      ok: true,
      answer,
      rows,
      cypher,
      params,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Chat query failed",
      },
      { status: 500 },
    );
  }
}
