import fs from "node:fs";
import path from "node:path";
import { runCypher } from "./src/lib/neo4j";
import * as dotenv from "dotenv";

dotenv.config();

const EXPORT_DIR = path.resolve(__dirname, "csv-export");

async function getCsvCount(filename: string): Promise<number> {
  const filePath = path.join(EXPORT_DIR, filename);
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.trim().split("\n");
  return lines.length > 0 ? lines.length - 1 : 0; // Subtract header
}

async function audit() {
  console.log("--- DATA AUDIT REPORT ---\n");

  const mappings = [
    { file: "sales_order_headers.csv", label: "SalesOrder" },
    { file: "sales_order_items.csv", label: "SalesOrderItem" },
    { file: "outbound_delivery_headers.csv", label: "Delivery" },
    { file: "outbound_delivery_items.csv", label: "DeliveryItem" },
    { file: "billing_document_headers.csv", label: "BillingDocument" },
    { file: "billing_document_items.csv", label: "BillingItem" },
    { file: "journal_entry_items_accounts_receivable.csv", label: "JournalEntry" },
    { file: "payments_accounts_receivable.csv", label: "Payment" },
    { file: "products.csv", label: "Product" },
    { file: "business_partners.csv", label: "Customer" },
    { file: "plants.csv", label: "Plant" },
  ];

  console.log(String("ENTITY").padEnd(20) + " | " + String("CSV ROWS").padEnd(10) + " | " + String("NEO4J NODES").padEnd(12));
  console.log("-".repeat(50));

  for (const m of mappings) {
    const csvCount = await getCsvCount(m.file);
    const result = await runCypher<{ records: any[] }>(`MATCH (n:${m.label}) RETURN count(*) as count`);
    const neo4jCount = result.records[0].get("count").toNumber();
    console.log(m.label.padEnd(20) + " | " + String(csvCount).padEnd(10) + " | " + String(neo4jCount).padEnd(12));
  }

  // Relationship checks
  console.log("\n--- RELATIONSHIP AUDIT ---\n");
  const relMappings = [
    { file: "product_plants.csv", type: "CAN_BE_SUPPLIED_BY" },
  ];

  console.log(String("RELATIONSHIP").padEnd(20) + " | " + String("CSV ROWS").padEnd(10) + " | " + String("NEO4J EDGES").padEnd(12));
  console.log("-".repeat(50));

  for (const m of relMappings) {
    const csvCount = await getCsvCount(m.file);
    const result = await runCypher<{ records: any[] }>(`MATCH ()-[r:${m.type}]->() RETURN count(*) as count`);
    const neo4jCount = result.records[0].get("count").toNumber();
    console.log(m.type.padEnd(20) + " | " + String(csvCount).padEnd(10) + " | " + String(neo4jCount).padEnd(12));
  }
}

audit().catch(console.error);
