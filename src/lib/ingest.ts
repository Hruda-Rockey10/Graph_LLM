import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { getNeo4jDriver } from "./neo4j";

type Row = Record<string, unknown>;

function datasetRoot() {
  return path.resolve(process.cwd(), "..", "sap-o2c-data");
}

function normalizeItem(value: unknown): string {
  return String(value ?? "").replace(/^0+/, "") || "0";
}

async function readJsonlFolder(folderName: string): Promise<Row[]> {
  const folderPath = path.join(datasetRoot(), folderName);
  const files = fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith(".jsonl"))
    .map((file) => path.join(folderPath, file));

  const rows: Row[] = [];
  for (const filePath of files) {
    const stream = fs.createReadStream(filePath, "utf8");
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      rows.push(JSON.parse(trimmed) as Row);
    }
  }
  return rows;
}

function toRecords(rows: Row[], mapFn: (row: Row) => Record<string, unknown>) {
  return rows.map(mapFn);
}

async function writeBatch(
  cypher: string,
  records: Record<string, unknown>[],
  key = "rows",
) {
  if (!records.length) return;
  const db = process.env.NEO4J_DATABASE || "neo4j";
  const session = getNeo4jDriver().session({ database: db });
  try {
    await session.run(cypher, {
      [key]: records,
    });
  } finally {
    await session.close();
  }
}

export async function resetGraph() {
  const db = process.env.NEO4J_DATABASE || "neo4j";
  const session = getNeo4jDriver().session({ database: db });
  try {
    await session.run("MATCH (n) DETACH DELETE n");
  } finally {
    await session.close();
  }
}

export async function ingestSapDataset() {
  const salesHeaders = await readJsonlFolder("sales_order_headers");
  const salesItems = await readJsonlFolder("sales_order_items");
  const deliveryHeaders = await readJsonlFolder("outbound_delivery_headers");
  const deliveryItems = await readJsonlFolder("outbound_delivery_items");
  const billingHeaders = await readJsonlFolder("billing_document_headers");
  const billingItems = await readJsonlFolder("billing_document_items");
  const journals = await readJsonlFolder("journal_entry_items_accounts_receivable");
  const payments = await readJsonlFolder("payments_accounts_receivable");
  const products = await readJsonlFolder("products");
  const customers = await readJsonlFolder("business_partners");

  // New datasets (from previous update)
  const productDescriptions = await readJsonlFolder("product_descriptions");
  const partnerAddresses = await readJsonlFolder("business_partner_addresses");
  const plantsData = await readJsonlFolder("plants");
  const cancellations = await readJsonlFolder("billing_document_cancellations");

  // Final 5 datasets
  const customerCompany = await readJsonlFolder("customer_company_assignments");
  const customerSalesArea = await readJsonlFolder("customer_sales_area_assignments");
  const productPlants = await readJsonlFolder("product_plants");
  const productStorage = await readJsonlFolder("product_storage_locations");
  const scheduleLines = await readJsonlFolder("sales_order_schedule_lines");

  // 1. Customers
  await writeBatch(
    `
UNWIND $rows AS row
MERGE (c:Customer {id: row.customerId})
SET c.customerId = row.customerId, c.name = row.businessPartnerName
`,
    toRecords(customers, (r) => ({
      customerId: String(r.businessPartner),
      businessPartnerName: String(r.businessPartnerName || ""),
    })),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MATCH (c:Customer {id: row.customerId})
SET c.city = row.cityName, c.country = row.country, c.street = row.streetName, c.postalCode = row.postalCode
`,
    toRecords(partnerAddresses, (r) => ({
      customerId: String(r.businessPartner),
      cityName: String(r.cityName || ""),
      country: String(r.country || ""),
      streetName: String(r.streetName || ""),
      postalCode: String(r.postalCode || ""),
    })),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MATCH (c:Customer {id: row.customerId})
SET c.companyCode = row.companyCode, c.customerAccountGroup = row.customerAccountGroup
`,
    toRecords(customerCompany, (r) => ({
      customerId: String(r.customer),
      companyCode: String(r.companyCode || ""),
      customerAccountGroup: String(r.customerAccountGroup || ""),
    })),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MATCH (c:Customer {id: row.customerId})
SET c.salesOrganization = row.salesOrganization, c.currency = row.currency, c.distributionChannel = row.distributionChannel
`,
    toRecords(customerSalesArea, (r) => ({
      customerId: String(r.customer),
      salesOrganization: String(r.salesOrganization || ""),
      currency: String(r.currency || ""),
      distributionChannel: String(r.distributionChannel || ""),
    })),
  );

  // 2. Products
  await writeBatch(
    `
UNWIND $rows AS row
MERGE (p:Product {id: row.material})
SET p.material = row.material, p.productType = row.productType
`,
    toRecords(products, (r) => ({
      material: String(r.product || ""),
      productType: String(r.productType || ""),
    })).filter((r) => r.material),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MATCH (p:Product {id: row.material})
SET p.name = row.productDescription
`,
    toRecords(productDescriptions, (r) => ({
      material: String(r.product || ""),
      productDescription: String(r.productDescription || ""),
    })),
  );

  // 3. Plants
  await writeBatch(
    `
UNWIND $rows AS row
MERGE (pl:Plant {id: row.plant})
SET pl.name = row.plantName, pl.salesOrganization = row.salesOrganization
`,
    toRecords(plantsData, (r) => ({
      plant: String(r.plant || ""),
      plantName: String(r.plantName || ""),
      salesOrganization: String(r.salesOrganization || ""),
    })),
  );

  // 4. Product-Plant Assignments
  await writeBatch(
    `
UNWIND $rows AS row
MATCH (p:Product {id: row.material})
MATCH (pl:Plant {id: row.plant})
MERGE (p)-[:CAN_BE_SUPPLIED_BY]->(pl)
SET p.profitCenter = row.profitCenter
`,
    toRecords(productPlants, (r) => ({
      material: String(r.product || ""),
      plant: String(r.plant || ""),
      profitCenter: String(r.profitCenter || ""),
    })),
  );

  // 5. Orders and Schedule Lines
  await writeBatch(
    `
UNWIND $rows AS row
MERGE (so:SalesOrder {id: row.salesOrder})
SET so += row
WITH so, row
MERGE (c:Customer {id: row.soldToParty})
MERGE (c)-[:PLACED]->(so)
`,
    toRecords(salesHeaders, (r) => ({
      salesOrder: String(r.salesOrder),
      soldToParty: String(r.soldToParty || ""),
      overallDeliveryStatus: String(r.overallDeliveryStatus || ""),
      overallOrdReltdBillgStatus: String(r.overallOrdReltdBillgStatus || ""),
      totalNetAmount: Number(r.totalNetAmount || 0),
      transactionCurrency: String(r.transactionCurrency || ""),
      creationDate: String(r.creationDate || ""),
    })),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MATCH (so:SalesOrder {id: row.salesOrder})
MERGE (si:SalesOrderItem {id: row.itemId})
SET si += row
MERGE (so)-[:HAS_ITEM]->(si)
MERGE (p:Product {id: row.material})
MERGE (si)-[:FOR_PRODUCT]->(p)
WITH si, row
MATCH (pl:Plant {id: row.productionPlant})
MERGE (si)-[:FROM_PLANT]->(pl)
`,
    toRecords(salesItems, (r) => {
      const salesOrder = String(r.salesOrder);
      const item = normalizeItem(r.salesOrderItem);
      return {
        itemId: `${salesOrder}-${item}`,
        salesOrder,
        salesOrderItem: item,
        material: String(r.material || ""),
        requestedQuantity: Number(r.requestedQuantity || 0),
        netAmount: Number(r.netAmount || 0),
        productionPlant: String(r.productionPlant || ""),
        storageLocation: String(r.storageLocation || ""),
      };
    }),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MATCH (si:SalesOrderItem {id: row.itemId})
SET si.requestedDeliveryDate = row.requestedDeliveryDate, si.confirmedDeliveryDate = row.confirmedDeliveryDate
`,
    toRecords(scheduleLines, (r) => ({
      itemId: `${String(r.salesOrder)}-${normalizeItem(r.salesOrderItem)}`,
      requestedDeliveryDate: String(r.requestedDeliveryDate || ""),
      confirmedDeliveryDate: String(r.confirmedDeliveryDate || ""),
    })),
  );

  // 6. Delivery
  await writeBatch(
    `
UNWIND $rows AS row
MERGE (d:Delivery {id: row.deliveryDocument})
SET d += row
`,
    toRecords(deliveryHeaders, (r) => ({
      deliveryDocument: String(r.deliveryDocument),
      shippingPoint: String(r.shippingPoint || ""),
      overallGoodsMovementStatus: String(r.overallGoodsMovementStatus || ""),
      overallPickingStatus: String(r.overallPickingStatus || ""),
      creationDate: String(r.creationDate || ""),
    })),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MERGE (di:DeliveryItem {id: row.deliveryItemId})
SET di += row
WITH di, row
MERGE (d:Delivery {id: row.deliveryDocument})
MERGE (di)-[:IN_DELIVERY]->(d)
WITH di, row
MATCH (si:SalesOrderItem {id: row.soItemId})
MERGE (si)-[:DELIVERED_AS]->(di)
WITH di, row
MATCH (pl:Plant {id: row.plant})
MERGE (di)-[:FROM_PLANT]->(pl)
`,
    toRecords(deliveryItems, (r) => {
      const deliveryDocument = String(r.deliveryDocument);
      const deliveryItem = normalizeItem(r.deliveryDocumentItem);
      const salesOrder = String(r.referenceSdDocument || "");
      const salesItem = normalizeItem(r.referenceSdDocumentItem);
      return {
        deliveryItemId: `${deliveryDocument}-${deliveryItem}`,
        deliveryDocument,
        deliveryDocumentItem: deliveryItem,
        soItemId: `${salesOrder}-${salesItem}`,
        referenceSdDocument: salesOrder,
        referenceSdDocumentItem: salesItem,
        actualDeliveryQuantity: Number(r.actualDeliveryQuantity || 0),
        plant: String(r.plant || ""),
        storageLocation: String(r.storageLocation || ""),
      };
    }),
  );

  // 7. Billing
  await writeBatch(
    `
UNWIND $rows AS row
MERGE (b:BillingDocument {id: row.billingDocument})
SET b += row
WITH b, row
MERGE (c:Customer {id: row.soldToParty})
MERGE (c)-[:BILLED_TO]->(b)
`,
    toRecords(billingHeaders, (r) => ({
      billingDocument: String(r.billingDocument),
      accountingDocument: String(r.accountingDocument || ""),
      soldToParty: String(r.soldToParty || ""),
      totalNetAmount: Number(r.totalNetAmount || 0),
      billingDocumentType: String(r.billingDocumentType || ""),
      billingDocumentDate: String(r.billingDocumentDate || ""),
      isCancelled: Boolean(r.billingDocumentIsCancelled),
    })),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MATCH (b:BillingDocument {id: row.billingId})
SET b.isCancelled = true
`,
    toRecords(cancellations, (r) => ({
      billingId: String(r.billingDocument),
    })),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MERGE (bi:BillingItem {id: row.billingItemId})
SET bi += row
WITH bi, row
MERGE (b:BillingDocument {id: row.billingDocument})
MERGE (bi)-[:IN_BILLING]->(b)
WITH bi, row
MATCH (di:DeliveryItem {id: row.deliveryItemId})
MERGE (di)-[:BILLED_AS]->(bi)
WITH bi, row
MERGE (p:Product {id: row.material})
MERGE (bi)-[:FOR_PRODUCT]->(p)
`,
    toRecords(billingItems, (r) => {
      const billingDocument = String(r.billingDocument);
      const billingItem = normalizeItem(r.billingDocumentItem);
      const deliveryDocument = String(r.referenceSdDocument || "");
      const deliveryItem = normalizeItem(r.referenceSdDocumentItem);
      return {
        billingItemId: `${billingDocument}-${billingItem}`,
        billingDocument,
        billingDocumentItem: billingItem,
        deliveryItemId: `${deliveryDocument}-${deliveryItem}`,
        referenceSdDocument: deliveryDocument,
        referenceSdDocumentItem: deliveryItem,
        material: String(r.material || ""),
        netAmount: Number(r.netAmount || 0),
      };
    }),
  );

  // 8. Finance
  await writeBatch(
    `
UNWIND $rows AS row
MERGE (j:JournalEntry {id: row.accountingDocument})
SET j += row
WITH j, row
MERGE (b:BillingDocument {id: row.referenceDocument})
MERGE (b)-[:POSTED_TO]->(j)
WITH j, row
MERGE (c:Customer {id: row.customer})
MERGE (c)-[:OWNS_JOURNAL_ENTRY]->(j)
`,
    toRecords(journals, (r) => ({
      accountingDocument: String(r.accountingDocument),
      companyCode: String(r.companyCode || ""),
      fiscalYear: String(r.fiscalYear || ""),
      referenceDocument: String(r.referenceDocument || ""),
      customer: String(r.customer || ""),
      amountInTransactionCurrency: Number(r.amountInTransactionCurrency || 0),
      accountingDocumentType: String(r.accountingDocumentType || ""),
      postingDate: String(r.postingDate || ""),
    })),
  );

  await writeBatch(
    `
UNWIND $rows AS row
MERGE (p:Payment {id: row.paymentId})
SET p += row
WITH p, row
MERGE (j:JournalEntry {id: row.accountingDocument})
MERGE (j)-[:SETTLED_BY]->(p)
WITH p, row
MERGE (c:Customer {id: row.customer})
MERGE (c)-[:MADE_PAYMENT]->(p)
`,
    toRecords(payments, (r) => ({
      paymentId: `${String(r.clearingAccountingDocument || "")}-${String(
        r.accountingDocument || "",
      )}`,
      accountingDocument: String(r.accountingDocument || ""),
      clearingAccountingDocument: String(r.clearingAccountingDocument || ""),
      customer: String(r.customer || ""),
      amountInTransactionCurrency: Number(r.amountInTransactionCurrency || 0),
      postingDate: String(r.postingDate || ""),
    })),
  );

  return {
    counts: {
      salesHeaders: salesHeaders.length,
      salesItems: salesItems.length,
      deliveryHeaders: deliveryHeaders.length,
      deliveryItems: deliveryItems.length,
      billingHeaders: billingHeaders.length,
      billingItems: billingItems.length,
      journals: journals.length,
      payments: payments.length,
      products: products.length,
      customers: customers.length,
      productDescriptions: productDescriptions.length,
      partnerAddresses: partnerAddresses.length,
      plants: plantsData.length,
      cancellations: cancellations.length,
      customerCompany: customerCompany.length,
      customerSalesArea: customerSalesArea.length,
      productPlants: productPlants.length,
      productStorage: productStorage.length,
      scheduleLines: scheduleLines.length,
    },
  };
}
