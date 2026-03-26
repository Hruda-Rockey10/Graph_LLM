import { createCypherPlan, summarizeAnswer } from "./src/lib/openrouter";
import { runCypher } from "./src/lib/neo4j";
import { serializeRows } from "./src/lib/graph";
import * as dotenv from "dotenv";

dotenv.config();

async function testFinalChat() {
  const questions = [
    "What is the distribution channel and currency for customer 310000108?",
    "List the plants that can supply product S8907367010814.",
    "Show the confirmed delivery date for one item in sales order 100000000."
  ];

  for (const q of questions) {
    console.log(`\n--- Question: ${q} ---`);
    try {
      const plan = await createCypherPlan(q);
      console.log("Plan:", plan.cypher);
      const result = await runCypher<{ records: Array<{ toObject: () => Record<string, unknown> }> }>(
        plan.cypher,
        plan.params
      );
      const rows = serializeRows(result.records);
      const answer = await summarizeAnswer(q, rows);
      console.log("Answer:", answer);
    } catch (e) {
      console.error("Error:", e);
    }
  }
}

testFinalChat().catch(console.error);
