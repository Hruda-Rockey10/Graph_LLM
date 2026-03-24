"use client";

import { useEffect, useMemo, useRef } from "react";
import cytoscape, { Core, ElementDefinition } from "cytoscape";
import type { GraphPayload } from "@/lib/types";

type Props = {
  graph: GraphPayload | null;
  selectedNodeId?: string | null;
  dimGranularNodes: boolean;
  onNodeClick: (nodeId: string) => void;
};

const NODE_COLORS: Record<string, string> = {
  SalesOrder: "#4f9dff",
  SalesOrderItem: "#8ebeff",
  Delivery: "#6cc4ff",
  DeliveryItem: "#95d7ff",
  BillingDocument: "#5d8ff3",
  BillingItem: "#90b2ff",
  JournalEntry: "#7a7cf6",
  Payment: "#7390aa",
  Product: "#e0809f",
  Customer: "#c06a8a",
  Entity: "#9aa6b2",
};

export function GraphView({ graph, selectedNodeId, dimGranularNodes, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const elements = useMemo<ElementDefinition[]>(() => {
    if (!graph) return [];
    const nodes = graph.nodes.map((node) => ({
      data: { ...node, color: NODE_COLORS[node.type] || NODE_COLORS.Entity },
      classes: [
        dimGranularNodes && ["SalesOrderItem", "DeliveryItem", "BillingItem"].includes(node.type) ? "granular" : "",
        selectedNodeId === node.id ? "selected" : ""
      ].join(" "),
    }));

    const edges = graph.edges.map((edge) => ({
      data: edge,
    }));

    return [...nodes, ...edges];
  }, [graph, dimGranularNodes, selectedNodeId]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: containerRef.current,
        layout: { name: "cose", animate: false, nodeRepulsion: 26000, idealEdgeLength: 120 },
        style: [
          {
            selector: "node",
            style: {
              "background-color": "data(color)",
              label: "data(label)",
              color: "#4a5568",
              "font-size": "8px",
              "text-valign": "bottom",
              "text-margin-y": 4,
              "text-wrap": "none",
              width: 10,
              height: 10,
            },
          },
          {
            selector: "edge",
            style: {
              width: 1,
              "line-color": "#cbd5e1",
              "target-arrow-color": "#cbd5e1",
              "curve-style": "bezier",
              "target-arrow-shape": "triangle",
              "arrow-scale": 0.4,
              opacity: 0.6,
              label: "data(type)",
              "font-size": "6px",
              color: "#94a3b8",
              "text-rotation": "autorotate",
              "text-margin-y": -5,
            },
          },
          {
            selector: "node.granular",
            style: {
              opacity: 0.15,
            },
          },
          {
            selector: "node.selected",
            style: {
              width: 16,
              height: 16,
              "border-width": 2,
              "border-color": "#2d3748",
              "font-weight": "bold",
              "font-size": "10px",
            },
          },
        ],
      });

      cyRef.current.on("tap", "node", (event) => {
        const id = event.target.data("id");
        if (id) onNodeClick(String(id));
      });
    }

    const cy = cyRef.current;
    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: "cose", animate: false, nodeRepulsion: 28000, idealEdgeLength: 140 }).run();
    cy.fit(undefined, 40);
  }, [elements, onNodeClick]);

  return <div ref={containerRef} className="h-full w-full rounded-xl bg-[#fcfdff]" />;
}
