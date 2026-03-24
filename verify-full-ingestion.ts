import { ingestSapDataset, resetGraph } from "./src/lib/ingest";
import { getNeo4jDriver } from "./src/lib/neo4j";
import * as dotenv from "dotenv";

dotenv.config();

async function verify() {
  console.log("Resetting graph...");
  await resetGraph();

  console.log("Starting ingestion...");
  const result = await ingestSapDataset();
  console.log("Ingestion result:", JSON.stringify(result, null, 2));

  const driver = getNeo4jDriver();
  const session = driver.session({ database: process.env.NEO4J_DATABASE || "neo4j" });

  try {
    const counts = await session.run(`
      MATCH (n)
      RETURN labels(n)[0] as label, count(*) as count
      ORDER BY label
    `);
    
    console.log("\nNode counts in Neo4j:");
    counts.records.forEach(r => {
      console.log(`${r.get("label")}: ${r.get("count")}`);
    });

    const rels = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) as type, count(*) as count
      ORDER BY type
    `);

    console.log("\nRelationship counts in Neo4j:");
    rels.records.forEach(r => {
      console.log(`${r.get("type")}: ${r.get("count")}`);
    });

    // Specific check for new relationship
    const assignmentCheck = await session.run(`
      MATCH (p:Product)-[:CAN_BE_SUPPLIED_BY]->(pl:Plant)
      RETURN count(*) as count
    `);
    console.log(`\nCAN_BE_SUPPLIED_BY relationships: ${assignmentCheck.records[0].get("count")}`);

  } finally {
    await session.close();
    await driver.close();
  }
}

verify().catch(console.error);
