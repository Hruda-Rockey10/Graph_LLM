"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { GraphView } from "@/components/GraphView";
import type { ChatMessage, GraphNode, GraphPayload } from "@/lib/types";

export default function Home() {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [dimGranularNodes, setDimGranularNodes] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statusText, setStatusText] = useState("Ready");
  const [isChatMinimized, setIsChatMinimized] = useState(false);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const loadGraph = useCallback(async (focusId?: string) => {
    setGraphLoading(true);
    try {
      const query = focusId ? `?focus=${encodeURIComponent(focusId)}` : "";
      const res = await fetch(`/api/graph${query}`);
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || "Could not load graph");
      setGraph({ nodes: payload.nodes, edges: payload.edges });

      if (focusId) {
        const found = payload.nodes.find((n: GraphNode) => {
          const p = n.properties || {};
          return [p.id, p.salesOrder, p.deliveryDocument, p.billingDocument, p.accountingDocument, p.customerId, p.material].map(String).includes(String(focusId));
        });
        if (found) setSelectedNode(found);
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Graph load failed");
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph().catch(() => null);
  }, [loadGraph]);

  const ask = useCallback(async (question: string) => {
    setChatLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || "Query failed");
      setMessages((prev) => [...prev, { role: "assistant", content: payload.answer }]);
      setStatusText("Query executed");

      const doc = question.match(/\b\d{6,12}\b/)?.[0];
      if (doc) {
        setFocus(doc);
        await loadGraph(doc);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Failed to process question.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [loadGraph]);

  async function ingestNow() {
    setStatusText("Ingesting SAP dataset into Neo4j...");
    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || "Ingestion failed");
      setStatusText(`Ingestion completed. Sales orders: ${payload.counts?.salesHeaders ?? 0}`);
      await loadGraph(focus || undefined);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Ingestion failed");
    }
  }

  const graphSummary = useMemo(() => {
    if (!graph) return "No graph loaded";
    return `${graph.nodes.length} nodes | ${graph.edges.length} edges`;
  }, [graph]);

  return (
    <main className="h-screen w-screen bg-[#f6f8fb] p-3">
      <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <p className="text-[14px] text-gray-500">Mapping / <span className="font-semibold text-gray-900">Order to Cash</span></p>
            <p className="text-xs text-gray-500">{statusText} - {graphSummary}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadGraph(focus || undefined)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>
            <button
              onClick={ingestNow}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Ingest
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="relative min-w-0 flex-1 border-r border-gray-200 bg-[#f9fcff] p-2">
            <div className="absolute left-4 top-4 z-20 flex gap-2">
              <button
                onClick={() => setIsChatMinimized((prev) => !prev)}
                className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                {isChatMinimized ? "Expand Chat" : "Collapse Chat"}
              </button>
              <button
                onClick={() => setDimGranularNodes((prev) => !prev)}
                className="rounded-md bg-black px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-gray-800"
              >
                {dimGranularNodes ? "Show All Details" : "Focus Main Flow"}
              </button>
            </div>

            {selectedNode && (
              <div className="absolute right-4 top-4 z-20 w-80 max-h-[80%] overflow-auto rounded-xl border border-gray-200 bg-white p-4 shadow-xl animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between border-b pb-2 mb-3">
                  <h3 className="text-lg font-bold text-gray-900">{selectedNode.type}</h3>
                  <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Metadata</p>
                  {Object.entries(selectedNode.properties || {}).map(([key, val]) => (
                    <div key={key} className="flex flex-col border-b border-gray-50 pb-1">
                      <span className="text-[10px] font-medium text-gray-500 lowercase">{key}</span>
                      <span className="text-xs font-semibold text-gray-800 break-all">{String(val)}</span>
                    </div>
                  ))}
                  <p className="text-[10px] italic text-gray-400 mt-4">ID: {selectedNode.id}</p>
                </div>
              </div>
            )}

            {graphLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Loading graph...
              </div>
            ) : (
              <GraphView
                graph={graph}
                selectedNodeId={selectedNode?.id}
                dimGranularNodes={dimGranularNodes}
                onNodeClick={(id) => {
                  setFocus(id);
                  loadGraph(id).catch(() => null);
                }}
              />
            )}
          </section>

          <aside className={`transition-all duration-300 ease-in-out ${isChatMinimized ? "w-0 opacity-0 overflow-hidden" : "w-[400px]"}`}>
            <ChatPanel onAsk={ask} messages={messages} loading={chatLoading} />
          </aside>
        </div>
      </div>
    </main>
  );
}
