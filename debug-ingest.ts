import { ingestSapDataset, resetGraph } from "./src/lib/ingest";
import { getNeo4jDriver } from "./src/lib/neo4j";
import * as dotenv from "dotenv";

dotenv.config();

async function debugIngest() {
  console.log("Database:", process.env.NEO4J_DATABASE);
  console.log("URI:", process.env.NEO4J_URI);

  try {
    console.log("Resetting graph...");
    await resetGraph();
    console.log("Graph reset successful.");

    console.log("Starting ingestion...");
    // We'll wrap individual writeBatch calls if we could, but they are inside ingestSapDataset.
    // So let's just run it and see if it throws.
    const result = await ingestSapDataset();
    console.log("Ingestion result:", JSON.stringify(result, null, 2));

    const driver = getNeo4jDriver();
    const session = driver.session({ database: process.env.NEO4J_DATABASE || "neo4j" });
    const counts = await session.run("MATCH (n) RETURN labels(n)[0] as label, count(*) as count");
    console.log("Final counts:", counts.records.map(r => `${r.get("label")}: ${r.get("count")}`));
    await session.close();
    await driver.close();

  } catch (e) {
    console.error("INGESTION FAILED:", e);
  }
}

debugIngest();
