import type { Node, Edge } from "@xyflow/react";
import type { TopologyNode, TopologyEdge, TopologyNodeType, NodeStatus } from "../../services/topologyApi";

// Shared React Flow data shapes + status colour classes for the topology components.

export type FlowNodeData = TopologyNode & { highlighted: boolean; dimmed: boolean };
export type FlowNode = Node<FlowNodeData>;

// targetType lets LinkEdge tell an LLDP-confirmed switch-to-switch link apart from an
// unconfirmed MAC-table link into a "cloud" (upstream network) node, without needing the
// full node list — see LinkEdge.tsx.
export type FlowEdgeData = TopologyEdge & {
  dimmed: boolean;
  sourceLabel: string;
  targetLabel: string;
  targetType: TopologyNodeType | undefined;
};
export type FlowEdge = Edge<FlowEdgeData>;

export const STATUS_RING: Record<NodeStatus, string> = {
  online: "border-green-500",
  offline: "border-red-500",
  rebooting: "border-amber-500",
  unknown: "border-gray-300 dark:border-slate-600",
};

export const STATUS_DOT: Record<NodeStatus, string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  rebooting: "bg-amber-500",
  unknown: "bg-gray-400",
};
