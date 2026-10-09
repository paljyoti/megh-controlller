// Device Details → Report tab. Defines the selectable report sections, each backed by the same
// API calls their corresponding existing tab already uses — this file does not add any new
// backend endpoints, it only re-fetches and re-shapes existing data for PDF/Excel export.
import { api } from "../services/api";
import { topologyApi } from "../services/topologyApi";

export type ReportSectionKey =
  | "performance"
  | "health"
  | "traffic"
  | "status"
  | "port"
  | "log"
  | "alarms"
  | "systemInfo"
  | "mac"
  | "protocol"
  | "configuration"
  | "vlan"
  | "interfaceStats"
  | "stp"
  | "lacp";

export interface ReportGroup {
  // Printed as a sub-heading above the table when a section bundles more than one table
  // (e.g. Configuration, Device Log). Omitted when the section is a single table.
  title?: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface SectionResult {
  key: ReportSectionKey;
  label: string;
  groups: ReportGroup[];
}

export type RangeKey = "4h" | "24h" | "7d" | "30d" | "week" | "custom";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "4h", label: "Last 4 Hours" },
  { key: "24h", label: "Last 24 Hours" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "week", label: "This Week" },
  { key: "custom", label: "Custom Range" },
];

export const resolvePeriod = (
  range: RangeKey,
  customFrom: string,
  customTo: string
): { from: Date; to: Date; label: string } => {
  const now = new Date();
  if (range === "custom") {
    const from = new Date(customFrom);
    const to = new Date(customTo + "T23:59:59");
    return { from, to, label: `Custom Range (${customFrom} to ${customTo})` };
  }
  if (range === "week") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - diffToMonday);
    return { from, to: now, label: "This Week" };
  }
  const hours = { "4h": 4, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 }[range];
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const label = RANGE_OPTIONS.find((o) => o.key === range)?.label ?? range;
  return { from, to: now, label };
};

// ── Formatting helpers ──────────────────────────────────────────────────────

const humanizeKey = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const formatValue = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.map(formatValue).join(", ") : "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

// A single object as a two-column Field/Value table (settings, summaries).
const kv = (obj: Record<string, unknown>, omit: string[] = ["id", "deviceId"], title?: string): ReportGroup => {
  const rows = Object.entries(obj)
    .filter(([key, value]) => !omit.includes(key) && value !== undefined)
    .map(([key, value]) => [humanizeKey(key), formatValue(value)]);
  return { title, headers: ["Field", "Value"], rows };
};

// An array of objects as a table, columns picked explicitly so the output stays readable.
const table = (
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
  title?: string
): ReportGroup => ({
  title,
  headers: columns.map((c) => c.label),
  rows: rows.map((row) => columns.map((c) => formatValue(row[c.key]))),
});

const withinPeriod = (iso: string, from: Date, to: Date) => {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
};

// ── Section definitions ─────────────────────────────────────────────────────

interface SectionDef {
  key: ReportSectionKey;
  label: string;
  // Whether the section's data is filtered to the selected period (vs. a current-state snapshot).
  timeBased: boolean;
  fetch: (deviceId: string, period: { from: Date; to: Date }, range: RangeKey) => Promise<ReportGroup[]>;
}

export const REPORT_SECTIONS: SectionDef[] = [
  {
    key: "performance",
    label: "Device Performance",
    timeBased: false,
    fetch: async (deviceId) => {
      const res = await api.getDeviceTelemetry(deviceId);
      const t = res.data.data.telemetry;
      return [
        kv({
          cpuUsagePct: t?.cpuUsage,
          memoryUsagePct: t?.memoryUsage,
          temperatureC: t?.temperature,
          softwareVersion: t?.softwareVersion,
        }),
      ];
    },
  },
  {
    key: "health",
    label: "Health",
    timeBased: false,
    fetch: async (deviceId) => {
      const res = await api.getDeviceStatus(deviceId);
      const s = res.data.data;
      return [
        kv({
          currentStatus: s?.currentStatus,
          uptimeSeconds: s?.latestRecord?.uptime,
          softwareVersion: s?.latestRecord?.softwareVersion,
        }),
      ];
    },
  },
  {
    key: "traffic",
    label: "Traffic",
    timeBased: true,
    // Reuses the device report endpoint built for the dashboard version of this tab
    // (backend/src/controllers/deviceReportController.ts) — same period keys, already scoped
    // to this device.
    fetch: async (deviceId, period, range) => {
      const res = await api.getDeviceReport(
        deviceId,
        range,
        range === "custom" ? period.from.toISOString() : undefined,
        range === "custom" ? period.to.toISOString() : undefined
      );
      const { summary, traffic } = res.data.data as {
        summary: Record<string, unknown>;
        traffic: { time: string; download: number; upload: number }[];
      };
      return [
        kv(
          {
            avgDownloadMbps: summary.avgDownloadMbps,
            avgUploadMbps: summary.avgUploadMbps,
            peakDownloadMbps: summary.peakDownloadMbps,
            peakUploadMbps: summary.peakUploadMbps,
          },
          [],
          "Traffic Summary"
        ),
        table(
          traffic,
          [
            { key: "time", label: "Time" },
            { key: "download", label: "Download (Mbps)" },
            { key: "upload", label: "Upload (Mbps)" },
          ],
          "Traffic"
        ),
      ];
    },
  },
  {
    key: "status",
    label: "Status",
    timeBased: true,
    fetch: async (deviceId, period) => {
      const res = await api.getDeviceStatusHistory(deviceId, 500);
      const history = (res.data.data.history ?? []).filter((h: { createdAt: string }) =>
        withinPeriod(h.createdAt, period.from, period.to)
      );
      return [
        table(
          history.map((h: Record<string, unknown>) => ({ ...h, createdAt: new Date(h.createdAt as string).toLocaleString() })),
          [
            { key: "createdAt", label: "Time" },
            { key: "status", label: "Status" },
            { key: "uptime", label: "Uptime (s)" },
          ]
        ),
      ];
    },
  },
  {
    key: "port",
    label: "Port Info",
    timeBased: false,
    fetch: async (deviceId) => {
      const res = await api.getPorts(deviceId);
      const ports: Record<string, unknown>[] = res.data.data.ports ?? [];
      return [
        table(ports, [
          { key: "name", label: "Port" },
          { key: "status", label: "Link Status" },
          { key: "adminStatus", label: "Admin Status" },
          { key: "portType", label: "Mode" },
          { key: "vlanId", label: "VLAN" },
          { key: "speed", label: "Speed" },
          { key: "duplex", label: "Duplex" },
          { key: "flowControl", label: "Flow Control" },
          { key: "mtu", label: "MTU" },
          { key: "poeEnabled", label: "PoE Enabled" },
        ]),
      ];
    },
  },
  {
    key: "mac",
    label: "MAC Address Table",
    timeBased: false,
    fetch: async (deviceId) => {
      const res = await topologyApi.getMacTable(deviceId);
      const entries = (res.data.data.entries ?? []) as unknown as Record<string, unknown>[];
      return [
        table(entries, [
          { key: "port", label: "Port" },
          { key: "mac", label: "MAC Address" },
          { key: "vlanId", label: "VLAN" },
          { key: "type", label: "Type" },
          { key: "learnedAt", label: "Learned At" },
          { key: "lastSeen", label: "Last Seen" },
        ]),
      ];
    },
  },
  {
    key: "protocol",
    label: "Protocol Status",
    timeBased: false,
    fetch: async () => [
      { headers: ["Note"], rows: [["Protocol Status reporting is not available yet for this device."]] },
    ],
  },
  {
    key: "log",
    label: "Device Log",
    timeBased: true,
    fetch: async (deviceId, period) => {
      const [eventsRes, cmdRes] = await Promise.all([
        api.getDeviceEvents(deviceId, 500),
        api.getCommandLogs(deviceId, 500),
      ]);
      const events = (eventsRes.data.data.events ?? []).filter((e: { createdAt: string }) =>
        withinPeriod(e.createdAt, period.from, period.to)
      );
      const commands = (cmdRes.data.data.commandLogs ?? []).filter((c: { createdAt: string }) =>
        withinPeriod(c.createdAt, period.from, period.to)
      );
      return [
        table(
          events.map((e: Record<string, unknown>) => ({ ...e, createdAt: new Date(e.createdAt as string).toLocaleString() })),
          [
            { key: "createdAt", label: "Time" },
            { key: "event", label: "Event" },
            { key: "port", label: "Port" },
          ],
          "Events"
        ),
        table(
          commands.map((c: Record<string, unknown>) => ({ ...c, createdAt: new Date(c.createdAt as string).toLocaleString() })),
          [
            { key: "createdAt", label: "Time" },
            { key: "command", label: "Command" },
            { key: "responseStatus", label: "Response Status" },
            { key: "responseMessage", label: "Response Message" },
          ],
          "Command History"
        ),
      ];
    },
  },
  {
    key: "alarms",
    label: "Alarms",
    timeBased: true,
    fetch: async (deviceId, period) => {
      const res = await api.getDeviceAlarms(deviceId, 500);
      const alarms = (res.data.data.alarms ?? []).filter((a: { triggeredAt: string }) =>
        withinPeriod(a.triggeredAt, period.from, period.to)
      );
      return [
        table(
          alarms.map((a: Record<string, unknown>) => ({ ...a, triggeredAt: new Date(a.triggeredAt as string).toLocaleString() })),
          [
            { key: "triggeredAt", label: "Time" },
            { key: "severity", label: "Severity" },
            { key: "type", label: "Type" },
            { key: "message", label: "Message" },
            { key: "status", label: "Status" },
          ]
        ),
      ];
    },
  },
  {
    key: "configuration",
    label: "Configuration",
    timeBased: false,
    fetch: async (deviceId) => {
      const [systemRes, poeRes, loopRes, dhcpRes, routesRes, portSecRes, l3Res] = await Promise.all([
        api.getSystemSettings(deviceId),
        api.getPoeSettings(deviceId),
        api.getLoopDetectSettings(deviceId),
        api.getDhcpPools(deviceId),
        api.getRoutes(deviceId),
        api.getPortSecurityMacs(deviceId),
        api.getL3Interfaces(deviceId),
      ]);
      return [
        kv(systemRes.data.data, ["id", "deviceId"], "System Settings"),
        kv(poeRes.data.data, ["id", "deviceId"], "PoE Settings"),
        kv(loopRes.data.data, ["id", "deviceId"], "Loop Detection Settings"),
        table(
          dhcpRes.data.data.pools ?? [],
          [
            { key: "poolName", label: "Pool" },
            { key: "network", label: "Network" },
            { key: "netmask", label: "Netmask" },
            { key: "gateway", label: "Gateway" },
            { key: "status", label: "Status" },
          ],
          "DHCP Pools"
        ),
        table(
          routesRes.data.data.routes ?? [],
          [
            { key: "destIpSegment", label: "Destination" },
            { key: "destIpMask", label: "Mask" },
            { key: "forwardingRoutingAddress", label: "Next Hop" },
            { key: "isDefaultRoute", label: "Default Route" },
          ],
          "Route Config"
        ),
        table(
          portSecRes.data.data.entries ?? [],
          [
            { key: "port", label: "Port" },
            { key: "macAddress", label: "MAC Address" },
            { key: "sticky", label: "Sticky" },
          ],
          "Port Security MAC Entries"
        ),
        table(
          l3Res.data.data.l3Interfaces ?? [],
          [
            { key: "interfaceName", label: "Interface" },
            { key: "ipv4Address", label: "IPv4 Address" },
            { key: "ipv6Address", label: "IPv6 Address" },
            { key: "deviceConfirmed", label: "Confirmed" },
          ],
          "L3 Interfaces"
        ),
      ];
    },
  },
  {
    key: "vlan",
    label: "VLAN Information",
    timeBased: false,
    fetch: async (deviceId) => {
      const res = await api.getVlans(deviceId);
      return [
        table(res.data.data.vlans ?? [], [
          { key: "vlanId", label: "VLAN ID" },
          { key: "name", label: "Name" },
        ]),
      ];
    },
  },
  {
    key: "interfaceStats",
    label: "Interface Statistics",
    timeBased: false,
    fetch: async (deviceId) => {
      const res = await api.getDeviceTelemetry(deviceId);
      const stats: Record<string, unknown>[] = res.data.data.telemetry?.interfaceStats ?? [];
      return [
        table(stats, [
          { key: "port", label: "Port" },
          { key: "status", label: "Status" },
          { key: "ipAddress", label: "IP Address" },
          { key: "macAddress", label: "MAC Address" },
          { key: "rxBytes", label: "Rx Bytes" },
          { key: "txBytes", label: "Tx Bytes" },
          { key: "rxPackets", label: "Rx Packets" },
          { key: "txPackets", label: "Tx Packets" },
        ]),
      ];
    },
  },
  {
    key: "stp",
    label: "STP Information",
    timeBased: false,
    fetch: async (deviceId) => {
      const res = await api.getStpSettings(deviceId);
      return [kv(res.data.data)];
    },
  },
  {
    key: "lacp",
    label: "LACP / Port Channel",
    timeBased: false,
    fetch: async (deviceId) => {
      const [laRes, priorityRes, methodRes] = await Promise.all([
        api.getLinkAggregations(deviceId),
        api.getLacpSystemPriority(deviceId),
        api.getLoadBalanceMethod(deviceId),
      ]);
      return [
        table(
          laRes.data.data.linkAggregations ?? [],
          [
            { key: "groupId", label: "Group ID" },
            { key: "mode", label: "Mode" },
            { key: "memberPorts", label: "Member Ports" },
            { key: "deviceConfirmed", label: "Confirmed" },
          ],
          "Port Channels"
        ),
        kv(
          { lacpSystemPriority: priorityRes.data.data.priority, loadBalanceMethod: methodRes.data.data.method },
          [],
          "LACP Settings"
        ),
      ];
    },
  },
  {
    key: "systemInfo",
    label: "System Information",
    timeBased: false,
    fetch: async (deviceId) => {
      const res = await api.getAllDevices();
      const device = (res.data.data.devices ?? []).find((d: { id: string }) => d.id === deviceId);
      return [
        kv({
          productId: device?.model,
          serialNumber: device?.serialNumber,
          macAddress: device?.macAddress,
          ipAddress: device?.ipAddress,
          hardwareVersion: device?.hardwareVersion,
          softwareVersion: device?.softwareVersion,
          status: device?.status,
        }),
      ];
    },
  },
];
