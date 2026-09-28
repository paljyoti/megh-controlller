import apiClient from "./api";

// Separate module so the existing `api` object in api.ts stays untouched.

export type TopologyNodeType = "switch" | "cloud" | "host";
export type NodeStatus = "online" | "offline" | "rebooting" | "unknown";
export type LinkStatus = "up" | "down" | "unknown";

export type TopologyNode = {
  id: string;
  type: TopologyNodeType;
  label: string;
  status: NodeStatus;
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
};

export type TopologyEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort: string;
  targetPort?: string | null;
  status: LinkStatus;
  rxBps: number | null;
  txBps: number | null;
  via: "mac" | "lldp";
};

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  generatedAt: string;
  macTableUpdatedAt: string | null;
}

export interface MacTableEntry {
  id: string;
  port: string;
  mac: string;
  vlanId: number;
  type: string;
  learnedAt: string | null;
  firstSeen: string;
  lastSeen: string;
}

export interface MacTableResponse {
  device: { id: string; name: string; serialNumber: string };
  total: number;
  ports: Record<string, number>;
  updatedAt: string | null;
  entries: MacTableEntry[];
}

export const topologyApi = {
  getTopology: () => apiClient.get<{ data: TopologyGraph }>("/topology"),
  refresh: (deviceId?: string) =>
    apiClient.post<{ data: { results: { deviceId: string; name: string; ok: boolean; rows?: number; error?: string }[] } }>(
      "/topology/refresh",
      null,
      { params: deviceId ? { device: deviceId } : {} },
    ),
  getMacTable: (deviceId: string) =>
    apiClient.get<{ data: MacTableResponse }>(`/topology/device/${deviceId}/mac-table`),
};

// "1.2 MB/s", "340 KB/s"
export const formatRate = (bps: number | null): string => {
  if (bps === null) return "—";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = bps;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
};

// "gigabitEthernet0/6" → "Gi0/6"
export const shortPort = (port: string): string =>
  port.replace(/^gigabitEthernet/i, "Gi").replace(/^tenGigabitEthernet/i, "Te");
