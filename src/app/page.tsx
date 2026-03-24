"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { GraphView } from "@/components/GraphView";
import type { ChatMessage, GraphPayload } from "@/lib/types";

export default function Home() {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [dimGranularNodes, setDimGranularNodes] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statusText, setStatusText] = useState("Ready");

  const loadGraph = useCallback(async (focusId?: string) => {
    setGraphLoading(true);
    try {
      const query = focusId ? `?focus=${encodeURIComponent(focusId)}` : "";
      const res = await fetch(`/api/graph${query}`);
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || "Could not load graph");
      setGraph({ nodes: payload.nodes, edges: payload.edges });
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
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
            >
              Refresh
            </button>
            <button
              onClick={ingestNow}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
            >
              Ingest
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="relative min-w-0 flex-1 border-r border-gray-200 bg-[#f9fcff] p-2">
            <div className="absolute left-4 top-4 z-20 flex gap-2">
              <button
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700"
              >
                Minimize
              </button>
              <button
                onClick={() => setDimGranularNodes((prev) => !prev)}
                className="rounded-md bg-black px-3 py-2 text-xs font-medium text-white"
              >
                {dimGranularNodes ? "Show Granular Overlay" : "Hide Granular Overlay"}
              </button>
            </div>

            {graphLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Loading graph...
              </div>
            ) : (
              <GraphView
                graph={graph}
                dimGranularNodes={dimGranularNodes}
                onNodeClick={(id) => {
                  setFocus(id);
                  loadGraph(id).catch(() => null);
                }}
              />
            )}
          </section>

          <ChatPanel onAsk={ask} messages={messages} loading={chatLoading} />
        </div>
      </div>
    </main>
  );
}
