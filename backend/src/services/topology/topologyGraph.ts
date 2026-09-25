import type { Prisma } from "@prisma/client";
import prisma from "../../db/client.js";
import { macOui, macToColon, normalizeMac } from "./macTableParser.js";

/*
  Builds the { nodes, edges } graph the Topology page renders, from data the platform
  already holds:
    - Device            → switch nodes (status, model, IP, alarm count)
    - MacEntry          → what sits behind each port (other managed switch / upstream cloud /
                          individual end devices)
    - Telemetry         → per-port link status + rx/tx rate (delta of the last two samples)
    - Neighbor (LLDP)   → switch-to-switch links once populated (schema ready, poller pending)

  Port classification (per switch port with learned MACs):
    - a MAC equals another managed Device's system MAC  → "switch" link to that device
    - ≥ CLOUD_THRESHOLD distinct MACs on the port        → one "cloud" node (upstream LAN)
    - otherwise                                          → one "host" node per MAC (capped)
 */

// Ports carrying this many MACs or more are treated as an uplink into a wider network — a
// single access port with a PC/camera/phone never learns this many.
const CLOUD_THRESHOLD = 5;
const MAX_HOSTS_PER_PORT = 8;

export type NodeType = "switch" | "cloud" | "host";

export interface TopologyNode {
  id: string;
  type: NodeType;
  label: string;
  status: "online" | "offline" | "rebooting" | "unknown";
  // switch only
  deviceId?: string;
  serialNumber?: string;
  model?: string;
  ipAddress?: string | null;
  softwareVersion?: string | null;
  macAddress?: string | null;
  activeAlarms?: number;
  portCount?: number;
  // host / cloud
  mac?: string; // colon form
  vlanId?: number;
  macCount?: number;
  // True for an unmanaged device whose MAC OUI matches one of our managed switches — most
  // likely another switch of the same vendor that isn't onboarded yet.
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
  rxBps: number | null; // bytes/sec into sourcePort
  txBps: number | null;
  // "mac" (inferred from MAC table) or "lldp" (confirmed neighbour)
  via: "mac" | "lldp";
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  generatedAt: string;
  // When the oldest MAC snapshot in this graph was refreshed — lets the UI say "as of".
  macTableUpdatedAt: string | null;
}

type PortStat = { status: "up" | "down" | "unknown"; rxBps: number | null; txBps: number | null };

// Latest per-port status and a byte-rate from the last two telemetry samples.
const loadPortStats = async (deviceId: string): Promise<Map<string, PortStat>> => {
  const samples = await prisma.telemetry.findMany({
    where: { deviceId },
    orderBy: { createdAt: "desc" },
    take: 2,
    include: { interfaceStats: { select: { port: true, status: true, rxBytes: true, txBytes: true } } },
  });
  const stats = new Map<string, PortStat>();
  const latest = samples[0];
  if (!latest) return stats;
  const previous = samples[1];
  const dt = previous ? (latest.createdAt.getTime() - previous.createdAt.getTime()) / 1000 : 0;
  const prevByPort = new Map(previous?.interfaceStats.map((s) => [s.port, s]) ?? []);

  for (const s of latest.interfaceStats) {
    const p = prevByPort.get(s.port);
    let rxBps: number | null = null;
    let txBps: number | null = null;
    if (p && dt > 0) {
      const drx = Number(s.rxBytes) - Number(p.rxBytes);
      const dtx = Number(s.txBytes) - Number(p.txBytes);
      // Counter reset (reboot) shows up as a negative delta — treat as unknown for this tick.
      rxBps = drx >= 0 ? drx / dt : null;
      txBps = dtx >= 0 ? dtx / dt : null;
    }
    stats.set(s.port, {
      status: s.status === "up" ? "up" : s.status === "down" ? "down" : "unknown",
      rxBps,
      txBps,
    });
  }
  return stats;
};

const asStatus = (s: string): TopologyNode["status"] =>
  s === "online" || s === "offline" || s === "rebooting" ? s : "unknown";

export const buildTopology = async (deviceWhere: Prisma.DeviceWhereInput): Promise<TopologyGraph> => {
  const devices = await prisma.device.findMany({
    where: deviceWhere,
    select: {
      id: true,
      name: true,
      serialNumber: true,
      model: true,
      status: true,
      ipAddress: true,
      softwareVersion: true,
      macAddress: true,
      _count: { select: { alarms: { where: { status: "active" } }, ports: true } },
      macEntries: {
        select: { port: true, mac: true, vlanId: true, learnedAt: true, lastSeen: true },
      },
      neighbors: { select: { localPort: true, remotePort: true, remoteDeviceId: true } },
    },
    orderBy: { name: "asc" },
  });

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const nodeIds = new Set<string>();
  const addNode = (n: TopologyNode) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push(n);
  };

  // Managed switches, keyed by normalized system MAC so MAC-table rows can be matched to them.
  const switchByMac = new Map<string, (typeof devices)[number]>();
  const managedOuis = new Set<string>();
  for (const d of devices) {
    const mac = d.macAddress ? normalizeMac(d.macAddress) : null;
    if (mac) {
      switchByMac.set(mac, d);
      managedOuis.add(macOui(mac));
    }
    addNode({
      id: d.id,
      type: "switch",
      label: d.name,
      status: asStatus(d.status),
      deviceId: d.id,
      serialNumber: d.serialNumber,
      model: d.model,
      ipAddress: d.ipAddress,
      softwareVersion: d.softwareVersion,
      macAddress: d.macAddress,
      activeAlarms: d._count.alarms,
      portCount: d._count.ports,
    });
  }

  const portStatsByDevice = new Map<string, Map<string, PortStat>>();
  await Promise.all(
    devices.map(async (d) => portStatsByDevice.set(d.id, await loadPortStats(d.id))),
  );

  // Avoid drawing A→B and B→A twice when both switches see each other.
  const linkedPairs = new Set<string>();
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");

  let macTableUpdatedAt: Date | null = null;

  for (const d of devices) {
    const portStats = portStatsByDevice.get(d.id) ?? new Map<string, PortStat>();
    const statFor = (port: string): PortStat =>
      portStats.get(port) ?? { status: "unknown", rxBps: null, txBps: null };

    // Confirmed LLDP links first — they take precedence over MAC inference for that port.
    const lldpPorts = new Set<string>();
    for (const n of d.neighbors) {
      if (!n.remoteDeviceId || !nodeIds.has(n.remoteDeviceId)) continue;
      lldpPorts.add(n.localPort);
      const key = pairKey(d.id, n.remoteDeviceId);
      if (linkedPairs.has(key)) continue;
      linkedPairs.add(key);
      const s = statFor(n.localPort);
      edges.push({
        id: `lldp:${d.id}:${n.localPort}`,
        source: d.id,
        target: n.remoteDeviceId,
        sourcePort: n.localPort,
        targetPort: n.remotePort,
        status: s.status,
        rxBps: s.rxBps,
        txBps: s.txBps,
        via: "lldp",
      });
    }

    // Group MAC entries by port.
    const byPort = new Map<string, typeof d.macEntries>();
    for (const e of d.macEntries) {
      if (!macTableUpdatedAt || e.lastSeen < macTableUpdatedAt) macTableUpdatedAt = e.lastSeen;
      const list = byPort.get(e.port) ?? [];
      list.push(e);
      byPort.set(e.port, list);
    }

    for (const [port, entries] of byPort) {
      if (lldpPorts.has(port)) continue;
      const s = statFor(port);
      const distinctMacs = new Map<string, (typeof entries)[number]>();
      for (const e of entries) if (!distinctMacs.has(e.mac)) distinctMacs.set(e.mac, e);

      // Managed switch behind this port?
      let matchedSwitch = false;
      for (const mac of distinctMacs.keys()) {
        const other = switchByMac.get(mac);
        if (!other || other.id === d.id) continue;
        matchedSwitch = true;
        const key = pairKey(d.id, other.id);
        if (linkedPairs.has(key)) break;
        linkedPairs.add(key);
        // The far-end port is whichever of the other switch's ports learned OUR MAC.
        const ourMac = d.macAddress ? normalizeMac(d.macAddress) : null;
        const farPort = ourMac
          ? other.macEntries.find((e) => e.mac === ourMac)?.port ?? null
          : null;
        edges.push({
          id: `mac:${d.id}:${port}`,
          source: d.id,
          target: other.id,
          sourcePort: port,
          targetPort: farPort,
          status: s.status,
          rxBps: s.rxBps,
          txBps: s.txBps,
          via: "mac",
        });
        break;
      }
      if (matchedSwitch) continue;

      if (distinctMacs.size >= CLOUD_THRESHOLD) {
        const id = `cloud:${d.id}:${port}`;
        addNode({
          id,
          type: "cloud",
          label: "Upstream network",
          status: s.status === "up" ? "online" : s.status === "down" ? "offline" : "unknown",
          macCount: distinctMacs.size,
          ...(entries[0] ? { vlanId: entries[0].vlanId } : {}),
          sameVendor: [...distinctMacs.keys()].some((m) => managedOuis.has(macOui(m))),
        });
        edges.push({
          id: `mac:${d.id}:${port}`,
          source: d.id,
          target: id,
          sourcePort: port,
          status: s.status,
          rxBps: s.rxBps,
          txBps: s.txBps,
          via: "mac",
        });
        continue;
      }

      let i = 0;
      for (const [mac, e] of distinctMacs) {
        if (i++ >= MAX_HOSTS_PER_PORT) break;
        const id = `host:${d.id}:${port}:${mac}`;
        addNode({
          id,
          type: "host",
          label: macToColon(mac),
          status: s.status === "up" ? "online" : s.status === "down" ? "offline" : "unknown",
          mac: macToColon(mac),
          vlanId: e.vlanId,
          learnedAt: e.learnedAt,
          sameVendor: managedOuis.has(macOui(mac)),
        });
        edges.push({
          id: `mac:${d.id}:${port}:${mac}`,
          source: d.id,
          target: id,
          sourcePort: port,
          status: s.status,
          rxBps: s.rxBps,
          txBps: s.txBps,
          via: "mac",
        });
      }
    }
  }

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    macTableUpdatedAt: macTableUpdatedAt ? (macTableUpdatedAt as Date).toISOString() : null,
  };
};
