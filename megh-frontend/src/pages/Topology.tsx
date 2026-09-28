import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { Network, Search, RefreshCw, LayoutGrid } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { canSendCommands } from "../services/api";
import { topologyApi, type TopologyGraph, type TopologyNode } from "../services/topologyApi";
import { nodeTypes, edgeTypes } from "../component/topology/registry";
import type { FlowNode, FlowEdge } from "../component/topology/types";
import NodePanel from "../component/topology/NodePanel";

// Network topology map — NPCIL sheet #4/#22/#24/#25/#26/#30. Nodes and links come from
// /api/v1/topology (MAC-table discovery, LLDP when available); the graph auto-refreshes so
// status colours stay live without a reload.

const AUTO_REFRESH_MS = 60 * 1000;

// Node box sizes dagre lays out against — roughly the rendered card sizes in nodes.tsx.
const NODE_SIZE: Record<TopologyNode["type"], { w: number; h: number }> = {
  switch: { w: 210, h: 80 },
  cloud: { w: 190, h: 70 },
  host: { w: 170, h: 54 },
};

const layout = (graph: TopologyGraph): Map<string, { x: number; y: number }> => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 90, marginx: 20, marginy: 20 });
  for (const n of graph.nodes) g.setNode(n.id, NODE_SIZE[n.type]);
  // Clouds go above switches (uplink), hosts below — flip cloud edges so dagre ranks them up.
  for (const e of graph.edges) {
    const target = graph.nodes.find((n) => n.id === e.target);
    if (target?.type === "cloud") g.setEdge(e.target, e.source);
    else g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of graph.nodes) {
    const p = g.node(n.id);
    const size = NODE_SIZE[n.type];
    positions.set(n.id, { x: p.x - size.w / 2, y: p.y - size.h / 2 });
  }
  return positions;
};

const matches = (n: TopologyNode, q: string) => {
  if (!q) return false;
  const s = q.toLowerCase();
  return (
    n.label.toLowerCase().includes(s) ||
    (n.ipAddress ?? "").toLowerCase().includes(s) ||
    (n.serialNumber ?? "").toLowerCase().includes(s) ||
    (n.mac ?? "").toLowerCase().includes(s) ||
    (n.macAddress ?? "").toLowerCase().includes(s) ||
    (n.model ?? "").toLowerCase().includes(s)
  );
};

const TopologyCanvas = () => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { fitView, setCenter } = useReactFlow();

  const [graph, setGraph] = useState<TopologyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  // Positions the user has dragged to — kept across auto-refreshes so the map doesn't jump.
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const layoutDoneRef = useRef(false);

  const load = useCallback(async (opts?: { relayout?: boolean }) => {
    try {
      const res = await topologyApi.getTopology();
      setGraph(res.data.data);
      setError("");
      if (opts?.relayout) {
        positionsRef.current = new Map();
        layoutDoneRef.current = false;
      }
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || "Failed to load topology");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const nodesById = useMemo(
    () => new Map((graph?.nodes ?? []).map((n) => [n.id, n])),
    [graph],
  );

  // Rebuild the React Flow nodes/edges whenever the graph or search changes. Positions come
  // from dagre the first time (or after "Auto layout"), then from wherever the user dragged.
  useEffect(() => {
    if (!graph) return;
    const anyMatch = graph.nodes.some((n) => matches(n, search));
    if (!layoutDoneRef.current) {
      positionsRef.current = layout(graph);
      layoutDoneRef.current = true;
    } else {
      // New nodes discovered since the last layout get a spot from dagre; existing ones keep theirs.
      const fresh = layout(graph);
      for (const [id, p] of fresh) if (!positionsRef.current.has(id)) positionsRef.current.set(id, p);
    }
    setNodes(
      graph.nodes.map((n) => {
        const hit = matches(n, search);
        return {
          id: n.id,
          type: n.type,
          position: positionsRef.current.get(n.id) ?? { x: 0, y: 0 },
          data: { ...n, highlighted: hit, dimmed: anyMatch && !hit },
          selected: n.id === selectedId,
        };
      }),
    );
    setEdges(
      graph.edges.map((e) => {
        const touchesHit =
          matches(nodesById.get(e.source)!, search) || matches(nodesById.get(e.target)!, search);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "link",
          data: {
            ...e,
            dimmed: anyMatch && !touchesHit,
            sourceLabel: nodesById.get(e.source)?.label ?? "",
            targetLabel: nodesById.get(e.target)?.label ?? "",
          },
          markerEnd: { type: MarkerType.Arrow, width: 12, height: 12, color: "transparent" },
        };
      }),
    );
    if (!positionsRef.current.size) return;
    // Fit once after the first layout.
    if (graph.nodes.length && !search) setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 50);
  }, [graph, search, selectedId, nodesById, setNodes, setEdges, fitView]);

  // Search: zoom to the first match — sheet #26 "device/IP should be highlighted upon search".
  useEffect(() => {
    if (!graph || !search) return;
    const hit = graph.nodes.find((n) => matches(n, search));
    if (!hit) return;
    const p = positionsRef.current.get(hit.id);
    if (!p) return;
    const size = NODE_SIZE[hit.type];
    setCenter(p.x + size.w / 2, p.y + size.h / 2, { zoom: 1.2, duration: 400 });
  }, [search, graph, setCenter]);

  const onNodeClick: NodeMouseHandler<FlowNode> = (_e, node) => setSelectedId(node.id);
  const onNodeDragStop: OnNodeDrag<FlowNode> = (_e, node) =>
    positionsRef.current.set(node.id, node.position);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (canSendCommands()) await topologyApi.refresh();
      await load();
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const selected = selectedId ? nodesById.get(selectedId) ?? null : null;
  const switches = graph?.nodes.filter((n) => n.type === "switch") ?? [];
  const online = switches.filter((n) => n.status === "online").length;

  return (
    <div className="p-6 min-h-screen space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <Network size={22} /> Topology
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {switches.length} switch{switches.length === 1 ? "" : "es"} ({online} online) ·{" "}
            {graph?.edges.length ?? 0} links
            {graph?.macTableUpdatedAt && (
              <> · discovered {new Date(graph.macTableUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / IP / MAC / serial"
              className="pl-9 pr-3 py-2 w-64 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => load({ relayout: true })}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
            title="Re-arrange nodes automatically"
          >
            <LayoutGrid size={15} /> Auto layout
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            title={canSendCommands() ? "Re-read MAC tables from switches now" : "Reload"}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Discovering…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="relative h-[calc(100vh-11rem)] rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">Loading...</div>
        ) : graph && graph.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
            <Network size={40} className="mb-3 text-gray-300 dark:text-gray-600" />
            No devices in scope yet.
          </div>
        ) : (
          <ReactFlow<FlowNode, FlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={(_e, n) => {
              if (n.data.type === "switch" && n.data.deviceId) window.location.assign(`/devices/${n.data.deviceId}`);
            }}
            onNodeDragStop={onNodeDragStop}
            onPaneClick={() => setSelectedId(null)}
            colorMode={isDark ? "dark" : "light"}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            deleteKeyCode={null}
          >
            <Background gap={24} color={isDark ? "#334155" : "#e5e7eb"} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => {
                const s = (n.data as { status?: string }).status;
                return s === "online" ? "#22c55e" : s === "offline" ? "#ef4444" : s === "rebooting" ? "#f59e0b" : "#9ca3af";
              }}
              maskColor={isDark ? "rgba(15,23,42,0.6)" : "rgba(249,250,251,0.7)"}
              style={{ backgroundColor: isDark ? "#1e293b" : "#ffffff" }}
            />
          </ReactFlow>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-14 flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white/90 dark:bg-slate-800/90 text-[11px] text-gray-600 dark:text-gray-300">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Online / up</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Offline / down</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Rebooting</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> Unknown</span>
          <span className="text-gray-400">· line thickness = traffic · hover a link for details</span>
        </div>

        {selected && graph && (
          <NodePanel node={selected} edges={graph.edges} nodesById={nodesById} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
};

const Topology = () => (
  <ReactFlowProvider>
    <TopologyCanvas />
  </ReactFlowProvider>
);

export default Topology;
