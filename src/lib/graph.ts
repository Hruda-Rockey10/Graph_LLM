import type { Node, Path, Relationship } from "neo4j-driver";
import { runCypher } from "./neo4j";
import type { GraphEdge, GraphNode, GraphPayload } from "./types";

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object" && "toNumber" in (value as object)) {
    try {
      return (value as { toNumber: () => number }).toNumber();
    } catch {
      return String(value);
    }
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        normalizeValue(v),
      ]),
    );
  }
  return value;
}

function nodeToGraphNode(node: Node): GraphNode {
  const props = normalizeValue(node.properties) as Record<string, unknown>;
  return {
    id: String(node.elementId),
    label: String(props.id || props.salesOrder || props.material || node.elementId),
    type: node.labels[0] || "Entity",
    properties: props,
  };
}

function relToGraphEdge(rel: Relationship): GraphEdge {
  const props = normalizeValue(rel.properties) as Record<string, unknown>;
  return {
    id: String(rel.elementId),
    source: String(rel.startNodeElementId),
    target: String(rel.endNodeElementId),
    type: rel.type,
    properties: props,
  };
}

function pathRecordsToGraph(paths: Path[]): GraphPayload {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  for (const path of paths) {
    for (const segment of path.segments) {
      const start = nodeToGraphNode(segment.start);
      const end = nodeToGraphNode(segment.end);
      const edge = relToGraphEdge(segment.relationship);
      nodeMap.set(start.id, start);
      nodeMap.set(end.id, end);
      edgeMap.set(edge.id, edge);
    }
  }

  return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
}

export async function loadGraph(focus?: string) {
  let result;
  if (focus) {
    result = await runCypher<{
      records: Array<{ get: (key: string) => Path }>;
    }>(
      `
MATCH (n)
WHERE any(v IN [n.id, n.salesOrder, n.deliveryDocument, n.billingDocument, n.accountingDocument, n.customerId, n.material] WHERE toString(v) = $focus)
WITH n LIMIT 1
MATCH p=(n)-[*0..2]-(m)
RETURN p
LIMIT 200
`,
      { focus },
    );
  } else {
    result = await runCypher<{
      records: Array<{ get: (key: string) => Path }>;
    }>(
      `
MATCH p=(n)-[r]->(m)
RETURN p
LIMIT 3000
`,
    );
  }

  const paths: Path[] = [];
  result.records.forEach((r) => {
    ["p", "p2", "p3", "p4", "p5"].forEach((key) => {
      try {
        const val = r.get(key);
        if (val) paths.push(val);
      } catch {
        // key might not exist
      }
    });
  });

  return pathRecordsToGraph(paths);
}

export function serializeRows(
  records: Array<{ toObject: () => Record<string, unknown> }>,
) {
  return records.map((record) => normalizeValue(record.toObject()));
}
