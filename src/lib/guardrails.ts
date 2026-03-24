const DOMAIN_TERMS = [
  "order",
  "sales",
  "delivery",
  "billing",
  "invoice",
  "payment",
  "journal",
  "customer",
  "product",
  "material",
  "sap",
  "o2c",
  "graph",
  "plant",
  "document",
];

export function isDomainQuestion(question: string): boolean {
  const lower = question.toLowerCase();
  return DOMAIN_TERMS.some((term) => lower.includes(term));
}

export function guardrailMessage(): string {
  return "This system is designed to answer questions related to the provided SAP O2C dataset only.";
}

export function isUnsafeCypher(cypher: string): boolean {
  const normalized = cypher.toUpperCase();
  return (
    normalized.includes("CREATE ") ||
    normalized.includes("MERGE ") ||
    normalized.includes("DELETE ") ||
    normalized.includes("DETACH ") ||
    normalized.includes("SET ") ||
    normalized.includes("REMOVE ") ||
    normalized.includes("DROP ") ||
    normalized.includes("LOAD CSV") ||
    normalized.includes("CALL DBMS") ||
    !normalized.includes("MATCH ")
  );
}
