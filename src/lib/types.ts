export type GraphNode = {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
};

export type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
