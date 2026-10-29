import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { X, ExternalLink, ArrowDown, ArrowUp } from "lucide-react";
import type { TopologyNode, TopologyEdge } from "../../services/topologyApi";
import { formatRate, shortPort } from "../../services/topologyApi";
import { STATUS_DOT } from "./types";
import type { NodeStatus } from "../../services/topologyApi";

const STATUS_PILL: Record<NodeStatus, string> = {
  online: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  offline: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  rebooting: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  unknown: "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400",
};
import { api } from "../../services/api";
import type { TelemetryData, StatusData } from "../../types/device";
import { useTheme } from "../../context/ThemeContext";

// Slide-in detail panel for the selected node — sheet #25 "neighbors, neighbor IP, neighbor
// interface, statistics, device vendor, model". Switch nodes get tabs (Overview / Interfaces /
// LLDP Neighbors / Traffic), each backed by an existing, already-used API — nothing here is
// fabricated. Cloud/host nodes keep the original single-view layout since none of those tabs
// apply to them (no device to query telemetry/report for).

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 dark:border-slate-700/60 last:border-0">
    <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-xs font-medium text-gray-800 dark:text-gray-100 text-right break-all">
      {value}
    </span>
  </div>
);

// "123456" (seconds, as the API returns it) → "1d 10h 17m"
const formatUptime = (seconds: string): string => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return "—";
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const formatBytes = (raw: string): string => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n.toFixed(0)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const LinksList = ({
  links,
  nodeId,
  nodesById,
  emptyText,
}: {
  links: TopologyEdge[];
  nodeId: string;
  nodesById: Map<string, TopologyNode>;
  emptyText: string;
}) => {
  if (links.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {links.map((e) => {
        const isSource = e.source === nodeId;
        const other = nodesById.get(isSource ? e.target : e.source);
        const localPort = isSource ? e.sourcePort : e.targetPort;
        const remotePort = isSource ? e.targetPort : e.sourcePort;
        return (
          <div
            key={e.id}
            className="rounded-xl border border-gray-100 dark:border-slate-700 p-2.5 hover:border-gray-200 dark:hover:border-slate-600 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                {other?.label ?? "?"}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[9px] uppercase font-semibold ${
                  e.status === "up"
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : e.status === "down"
                      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                      : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400"
                }`}
              >
                {e.status}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-full ${
                  e.via === "lldp"
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400"
                }`}
              >
                {e.via === "lldp" ? "LLDP" : "Unconfirmed"}
              </span>
              <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                {localPort ? shortPort(localPort) : "?"} ↔ {remotePort ? shortPort(remotePort) : "?"}
              </p>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1">
                <ArrowDown size={11} className="text-blue-500" /> {formatRate(e.rxBps)}
              </span>
              <span className="flex items-center gap-1">
                <ArrowUp size={11} className="text-green-500" /> {formatRate(e.txBps)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

type SwitchTabKey = "overview" | "interfaces" | "lldp" | "traffic";
const SWITCH_TABS: { key: SwitchTabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "interfaces", label: "Interfaces" },
  { key: "lldp", label: "LLDP Neighbors" },
  { key: "traffic", label: "Traffic" },
];

const NodePanel = ({
  node,
  edges,
  nodesById,
  onClose,
}: {
  node: TopologyNode;
  edges: TopologyEdge[];
  nodesById: Map<string, TopologyNode>;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const axisColor = isDark ? "#9ca3af" : "#6b7280";
  const gridColor = isDark ? "#334155" : "#e5e7eb";
  const links = edges.filter((e) => e.source === node.id || e.target === node.id);

  // Parent mounts NodePanel with key={node.id} (see Topology.tsx), so switching to a different
  // node gives a fresh component instance — no manual "reset on prop change" effect needed.
  const [tab, setTab] = useState<SwitchTabKey>("overview");
  const [status, setStatus] = useState<StatusData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [traffic, setTraffic] = useState<{ time: string; download: number; upload: number }[] | null>(null);
  const [tabError, setTabError] = useState("");

  // Uptime (Overview) — cheap enough to fetch as soon as a switch is selected. The only
  // setState calls here happen inside the promise callbacks (after the effect itself has
  // already returned), not synchronously in the effect body.
  useEffect(() => {
    if (node.type !== "switch" || !node.deviceId) return;
    let cancelled = false;
    api
      .getDeviceStatus(node.deviceId)
      .then((res) => {
        if (!cancelled) setStatus(res.data.data as StatusData);
      })
      .catch(() => {
        /* Overview still renders fine without uptime */
      });
    return () => {
      cancelled = true;
    };
  }, [node.type, node.deviceId]);

  // Interfaces / Traffic are heavier — fetched only once their tab is actually opened. "Loading"
  // is derived at render time (tab selected, no data yet, no error) instead of a separate flag,
  // so there's nothing to set synchronously here either.
  useEffect(() => {
    if (node.type !== "switch" || !node.deviceId) return;
    let cancelled = false;
    if (tab === "interfaces" && !telemetry) {
      api
        .getDeviceTelemetry(node.deviceId)
        .then((res) => {
          if (!cancelled) setTelemetry(res.data.data as TelemetryData);
        })
        .catch(() => {
          if (!cancelled) setTabError("Failed to load interface data");
        });
    }
    if (tab === "traffic" && !traffic) {
      api
        .getDeviceReport(node.deviceId, "4h")
        .then((res) => {
          if (!cancelled) setTraffic(res.data.data.traffic);
        })
        .catch(() => {
          if (!cancelled) setTabError("Failed to load traffic data");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [tab, node.type, node.deviceId, telemetry, traffic]);

  const interfacesLoading = tab === "interfaces" && !telemetry && !tabError;
  const trafficLoading = tab === "traffic" && !traffic && !tabError;
  const lldpCount = links.filter((e) => e.via === "lldp").length;

  return (
    <div className="absolute top-4 right-4 w-96 max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-10">
      <div className="flex items-start justify-between p-4 border-b border-gray-100 dark:border-slate-700">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{node.label}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {node.type === "switch" ? "Managed switch" : node.type === "cloud" ? "Upstream network" : node.sameVendor ? "Switch (same vendor, not onboarded)" : "End device"}
            </span>
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_PILL[node.status]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[node.status]}`} />
              {node.status}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
        >
          <X size={16} />
        </button>
      </div>

      {node.type === "switch" ? (
        <>
          <div className="flex items-center gap-4 px-4 pt-2 border-b border-gray-100 dark:border-slate-700 overflow-x-auto">
            {SWITCH_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap pb-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {t.label}
                {t.key === "lldp" && lldpCount > 0 ? ` (${lldpCount})` : ""}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "overview" && (
              <>
                <div className="rounded-xl border border-gray-100 dark:border-slate-700 p-3">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Device Information
                  </p>
                  <Row label="Model" value={node.model ?? "—"} />
                  <Row label="Serial" value={node.serialNumber ?? "—"} />
                  <Row label="IP address" value={node.ipAddress ?? "—"} />
                  <Row label="MAC" value={<span className="font-mono">{node.macAddress ?? "—"}</span>} />
                  <Row label="Firmware" value={node.softwareVersion ?? "—"} />
                  {status?.latestRecord?.uptime && (
                    <Row label="Uptime" value={formatUptime(status.latestRecord.uptime)} />
                  )}
                  <Row label="Active alarms" value={node.activeAlarms ?? 0} />
                </div>
                <button
                  onClick={() => navigate(`/devices/${node.deviceId}`)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Open device <ExternalLink size={14} />
                </button>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      LLDP Neighbors ({lldpCount})
                    </p>
                    {links.length > 0 && (
                      <button
                        onClick={() => setTab("lldp")}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View all
                      </button>
                    )}
                  </div>
                  <LinksList
                    links={links.slice(0, 2)}
                    nodeId={node.id}
                    nodesById={nodesById}
                    emptyText="No neighbors discovered yet."
                  />
                </div>
              </>
            )}

            {tab === "interfaces" && (
              <>
                {interfacesLoading && <p className="text-xs text-gray-400 dark:text-gray-500">Loading…</p>}
                {!interfacesLoading && tabError && <p className="text-xs text-red-500">{tabError}</p>}
                {!interfacesLoading && !tabError && telemetry && telemetry.interfaceStats.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No interface data available.</p>
                )}
                {!interfacesLoading && !tabError && telemetry && telemetry.interfaceStats.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700">
                          <th className="py-1.5 pr-2 font-medium">Port</th>
                          <th className="py-1.5 pr-2 font-medium">Status</th>
                          <th className="py-1.5 pr-2 font-medium">Rx</th>
                          <th className="py-1.5 font-medium">Tx</th>
                        </tr>
                      </thead>
                      <tbody>
                        {telemetry.interfaceStats.map((s) => (
                          <tr key={s.port} className="border-b border-gray-50 dark:border-slate-700/60 last:border-0">
                            <td className="py-1.5 pr-2 font-mono text-gray-700 dark:text-gray-200">{shortPort(s.port)}</td>
                            <td className="py-1.5 pr-2">
                              <span className={s.status === "up" ? "text-green-600 dark:text-green-400" : "text-gray-400"}>
                                {s.status}
                              </span>
                            </td>
                            <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-300">{formatBytes(s.rxBytes)}</td>
                            <td className="py-1.5 text-gray-600 dark:text-gray-300">{formatBytes(s.txBytes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === "lldp" && (
              <LinksList
                links={links}
                nodeId={node.id}
                nodesById={nodesById}
                emptyText="No neighbors discovered yet — LLDP hasn't confirmed a link on any port, and no MAC-table activity has been inferred either."
              />
            )}

            {tab === "traffic" && (
              <>
                {trafficLoading && <p className="text-xs text-gray-400 dark:text-gray-500">Loading…</p>}
                {!trafficLoading && tabError && <p className="text-xs text-red-500">{tabError}</p>}
                {!trafficLoading && !tabError && traffic && traffic.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No telemetry in the last 4 hours.</p>
                )}
                {!trafficLoading && !tabError && traffic && traffic.length > 0 && (
                  <div className="h-48 w-full relative">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 absolute top-0 left-1 z-10">Mbps</span>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={traffic} margin={{ top: 16, right: 6, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: 10 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? "#1e293b" : "#ffffff",
                            border: `1px solid ${gridColor}`,
                            borderRadius: 8,
                            fontSize: 11,
                            color: isDark ? "#e5e7eb" : "#111827",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Area type="monotone" dataKey="download" name="Download" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.6} />
                        <Area type="monotone" dataKey="upload" name="Upload" stroke="#5eead4" fill="#5eead4" fillOpacity={0.6} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="p-4">
          {node.type === "cloud" && (
            <>
              <Row label="MAC addresses" value={node.macCount ?? 0} />
              <Row label="VLAN" value={node.vlanId ?? "—"} />
              <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
                Many MAC addresses learned on one port — this is an uplink into a wider network
                (router, core switch, or unmanaged switches).
              </p>
            </>
          )}
          {node.type === "host" && (
            <>
              <Row label="MAC" value={<span className="font-mono">{node.mac}</span>} />
              <Row label="VLAN" value={node.vlanId ?? "—"} />
              <Row label="Learned at" value={node.learnedAt ?? "—"} />
            </>
          )}

          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-4 mb-2">
            Links ({links.length})
          </p>
          <LinksList links={links} nodeId={node.id} nodesById={nodesById} emptyText="No links discovered yet." />
        </div>
      )}
    </div>
  );
};

export default NodePanel;
