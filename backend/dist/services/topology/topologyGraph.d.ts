import type { Prisma } from "@prisma/client";
export type NodeType = "switch" | "cloud" | "host";
export interface TopologyNode {
    id: string;
    type: NodeType;
    label: string;
    status: "online" | "offline" | "rebooting" | "unknown";
    deviceId?: string;
    serialNumber?: string;
    model?: string;
    ipAddress?: string | null;
    softwareVersion?: string | null;
    macAddress?: string | null;
    activeAlarms?: number;
    portCount?: number;
    mac?: string;
    vlanId?: number;
    macCount?: number;
    sameVendor?: boolean;
    learnedAt?: string | null;
}
export interface TopologyEdge {
    id: string;
    source: string;
    target: string;
    sourcePort: string;
    targetPort?: string | null;
    status: "up" | "down" | "unknown";
    rxBps: number | null;
    txBps: number | null;
    via: "mac" | "lldp";
}
export interface TopologyGraph {
    nodes: TopologyNode[];
    edges: TopologyEdge[];
    generatedAt: string;
    macTableUpdatedAt: string | null;
}
export declare const buildTopology: (deviceWhere: Prisma.DeviceWhereInput) => Promise<TopologyGraph>;
//# sourceMappingURL=topologyGraph.d.ts.map