import { z } from "zod";

const queryPlanSchema = z.object({
  cypher: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  explanation: z.string(),
});

type QueryPlan = z.infer<typeof queryPlanSchema>;

type OpenRouterMessage = {
  role: "system" | "user";
  content: string;
};

async function callOpenRouter(messages: OpenRouterMessage[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const primaryModel = process.env.OPENROUTER_MODEL || "stepfun/step-3.5-flash:free";
  const backupModel = process.env.OPENROUTER_BACKUP_MODEL;
  const siteUrl = process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
  const siteName = process.env.OPENROUTER_SITE_NAME || "Dodge AI";

  const modelsToTry = [primaryModel];
  if (backupModel) modelsToTry.push(backupModel);

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": siteUrl,
          "X-Title": siteName,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenRouter (${model}) error: ${res.status} ${text}`);
      }

      const payload = await res.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`OpenRouter (${model}) returned empty content`);
      }

      return content as string;
    } catch (error) {
      console.error(`Attempt with ${model} failed:`, error);
      lastError = error as Error;
      // If there's another model to try (the backup), continue the loop
      if (modelsToTry.indexOf(model) < modelsToTry.length - 1) {
        console.log(`Retrying with backup model: ${backupModel}`);
        continue;
      }
    }
  }

  throw lastError || new Error("OpenRouter call failed");
}

export async function createCypherPlan(question: string): Promise<QueryPlan> {
  const schemaGuide = `
Return JSON object with keys:
- cypher: read-only Cypher query with LIMIT <= 50
- params: key-value map
- explanation: one line about what query does

Dataset graph labels and key properties:
- SalesOrder {id, salesOrder, overallDeliveryStatus, overallOrdReltdBillgStatus, totalNetAmount, transactionCurrency, creationDate}
- SalesOrderItem {id, salesOrderItem, netAmount, requestedQuantity, productionPlant, storageLocation, requestedDeliveryDate, confirmedDeliveryDate}
- Delivery {id, deliveryDocument, shippingPoint, overallGoodsMovementStatus, overallPickingStatus, creationDate}
- DeliveryItem {id, deliveryDocumentItem, referenceSdDocument, referenceSdDocumentItem, actualDeliveryQuantity, plant, storageLocation}
- BillingDocument {id, billingDocument, accountingDocument, soldToParty, totalNetAmount, billingDocumentType, billingDocumentDate, isCancelled}
- BillingItem {id, billingDocumentItem, referenceSdDocument, referenceSdDocumentItem, material, netAmount}
- JournalEntry {id, accountingDocument, companyCode, fiscalYear, referenceDocument, customer, amountInTransactionCurrency, accountingDocumentType, postingDate}
- Payment {id, paymentId, accountingDocument, clearingAccountingDocument, customer, amountInTransactionCurrency, postingDate}
- Product {id, material, productType, name, profitCenter}
- Customer {id, customerId, name, city, country, street, postalCode, companyCode, customerAccountGroup, salesOrganization, currency, distributionChannel}
- Plant {id, name, salesOrganization}

Relationships:
- (Customer)-[:PLACED]->(SalesOrder)
- (SalesOrder)-[:HAS_ITEM]->(SalesOrderItem)
- (SalesOrderItem)-[:FOR_PRODUCT]->(Product)
- (SalesOrderItem)-[:DELIVERED_AS]->(DeliveryItem)
- (SalesOrderItem)-[:FROM_PLANT]->(Plant)
- (Product)-[:CAN_BE_SUPPLIED_BY]->(Plant)
- (DeliveryItem)-[:IN_DELIVERY]->(Delivery)
- (DeliveryItem)-[:BILLED_AS]->(BillingItem)
- (DeliveryItem)-[:FROM_PLANT]->(Plant)
- (BillingItem)-[:IN_BILLING]->(BillingDocument)
- (BillingDocument)-[:POSTED_TO]->(JournalEntry)
- (JournalEntry)-[:SETTLED_BY]->(Payment)
- (Customer)-[:BILLED_TO]->(BillingDocument)
- (Customer)-[:MADE_PAYMENT]->(Payment)
- (Customer)-[:OWNS_JOURNAL_ENTRY]->(JournalEntry)
- (BillingDocument)-[:POSTED_TO]->(JournalEntry)
`;

  const raw = await callOpenRouter([
    {
      role: "system",
      content: `You are a Cypher planner for SAP O2C analytics. Respond in JSON format.\n${schemaGuide}`,
    },
    {
      role: "user",
      content: question,
    },
  ]);

  const parsed = JSON.parse(raw);
  return queryPlanSchema.parse(parsed);
}

export async function summarizeAnswer(question: string, rows: unknown[]) {
  const raw = await callOpenRouter([
    {
      role: "system",
      content:
        "You are a data-grounded assistant. Summarize query results in plain English and respond in JSON format. If rows are empty, say no matching records were found.",
    },
    {
      role: "user",
      content: `Question: ${question}\nData: ${JSON.stringify(rows)}\nRespond in JSON format with an 'answer' key.`,
    },
  ]);

  const parsed = JSON.parse(raw);
  return (parsed.answer || parsed.response || raw) as string;
}
