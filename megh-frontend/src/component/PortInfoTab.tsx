import { useEffect, useState, useCallback } from "react";
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
import { Pencil, Check, X as XIcon, Settings2, X as CloseIcon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { api } from "../services/api";
import type { TelemetryData } from "../types/device";
import ExportButton from "./ExportButton";
import type { ExportColumn } from "../utils/export";

type PortType = "access" | "trunk";
type AdminStatus = "up" | "down";
type Speed = "auto" | "10" | "100" | "1000";
type Duplex = "auto" | "full" | "half";
type FlowControl = "on" | "off";
type Medium = "copper" | "fiber";
type SfpMode = "sgmii" | "2500BASE-X" | "1000BASE-X" | "10G";
type Autoneg = "on" | "off";
type PortStateLabel = "up" | "shutdown" | "error-down";

interface PortRow {
  name: string;
  status: string; // live link status from telemetry: "up" | "down" | "unknown"
  description: string | null;
  portType: PortType;
  vlanId: number;
  adminStatus: AdminStatus;
  speed: Speed;
  duplex: Duplex;
  flowControl: FlowControl;
  mtu: number;
  medium: Medium;
  sfpMode: SfpMode | null;
  autoneg: Autoneg;
  // False until the switch has confirmed the most recently applied config for this port —
  // also false for rows saved before this field existed (the old DB-only stub era).
  deviceConfirmed: boolean;
}

type FieldResult = { applied: boolean; message?: string };

const extractPortUpdateResult = (
  err: unknown
): { ports?: PortRow[]; results?: Record<string, FieldResult> } | null => {
  const body = (err as { response?: { data?: { data?: { ports?: PortRow[]; results?: Record<string, FieldResult> } } } })
    ?.response?.data?.data;
  return body ?? null;
};

function portNumber(port: string): number {
  const match = port.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function portLabel(port: string): string {
  const match = port.match(/(\d+)$/);
  return match ? match[1] : port;
}

function isFiberPort(port: string): boolean {
  const name = port.toLowerCase();
  return name.startsWith("tengigabitethernet") || name.startsWith("xgigabit") || name.startsWith("sfp");
}

function isCopperPort(port: string): boolean {
  const name = port.toLowerCase();
  return (
    name.startsWith("gigabitethernet") || name.startsWith("fastethernet") || name.startsWith("ethernet")
  );
}

// api.getPorts() returns every interface telemetry has ever seen — physical switch ports
// (gigabitEthernet.../tengigabitEthernet...) plus logical ones (vlan1, po1...). This tab is
// specifically about physical ports (VLANs and port-channels have their own Configuration
// tabs), and mixing them in breaks port-number labeling (e.g. "po1" and "vlan1" both label as
// "1") and falsely flags logical interfaces as "Error-down" since they have no real link state.
function isPhysicalPort(port: string): boolean {
  return isCopperPort(port) || isFiberPort(port);
}

function portState(p: PortRow): PortStateLabel {
  if (p.adminStatus === "down") return "shutdown";
  if (p.status !== "up") return "error-down";
  return "up";
}

const STATE_COLOR: Record<PortStateLabel, string> = {
  up: "text-green-500",
  shutdown: "text-gray-400 dark:text-slate-600",
  "error-down": "text-red-500",
};

// RJ45 ethernet port glyph: outlined body with comb-tooth pins along the top edge and a
// small clip tab hanging off the bottom, drawn as strokes so it stays recolorable via
// `currentColor`.
function PortShape({ state }: { state: PortStateLabel }) {
  const teethXs = [6.5, 9, 11.5, 14, 16.5];

  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-8 h-8 ${STATE_COLOR[state]}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="6" width="16" height="11" rx="1.5" />
      {teethXs.map((x) => (
        <line key={x} x1={x} y1="6" x2={x} y2="4" />
      ))}
      <path d="M10 17v2h4v-2" />
    </svg>
  );
}

function FiberPortShape() {
  return (
    <svg
      viewBox="0 0 56 56"
      className="w-8 h-8 text-gray-400 dark:text-slate-600"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 7.7148 49.5742 L 48.2852 49.5742 C 53.1836 49.5742 55.6446 47.1367 55.6446 42.3086 L 55.6446 13.6914 C 55.6446 8.8633 53.1836 6.4258 48.2852 6.4258 L 7.7148 6.4258 C 2.8398 6.4258 .3554 8.8398 .3554 13.6914 L .3554 42.3086 C .3554 47.1602 2.8398 49.5742 7.7148 49.5742 Z M 7.7851 45.8008 C 5.4413 45.8008 4.1288 44.5586 4.1288 42.1211 L 4.1288 13.8789 C 4.1288 11.4414 5.4413 10.1992 7.7851 10.1992 L 48.2147 10.1992 C 50.5350 10.1992 51.8708 11.4414 51.8708 13.8789 L 51.8708 42.1211 C 51.8708 44.5586 50.5350 45.8008 48.2147 45.8008 Z" />
    </svg>
  );
}

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return message || fallback;
};

const formatBytes = (n: number) => {
  if (n < 1024) return `${n.toFixed(0)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const PortInfoTab = ({
  telemetry,
  deviceId,
  uptimeSeconds,
}: {
  telemetry: TelemetryData | null;
  deviceId?: string;
  uptimeSeconds?: number;
}) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const axisColor = isDark ? "#9ca3af" : "#6b7280";
  const gridColor = isDark ? "#334155" : "#e5e7eb";

  const [ports, setPorts] = useState<PortRow[]>([]);
  const [aggregatedPorts, setAggregatedPorts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<"status" | "flow">("status");
  const [showRate, setShowRate] = useState(false);
  const [editingDescFor, setEditingDescFor] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState("");
  const [editingPort, setEditingPort] = useState<PortRow | null>(null);
  const [savingPort, setSavingPort] = useState<string | null>(null);

  const fetchPorts = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError("");
    try {
      const [portsRes, laRes] = await Promise.allSettled([
        api.getPorts(deviceId),
        api.getLinkAggregations(deviceId),
      ]);
      if (portsRes.status === "fulfilled") {
        setPorts(
          (portsRes.value.data.data.ports as PortRow[])
            .filter((p) => isPhysicalPort(p.name))
            .sort((a, b) => portNumber(a.name) - portNumber(b.name))
        );
      } else {
        setError(extractErrorMessage(portsRes.reason, "Failed to load ports"));
      }
      if (laRes.status === "fulfilled") {
        const groups = laRes.value.data.data.linkAggregations as { memberPorts: string[] }[];
        setAggregatedPorts(new Set(groups.flatMap((g) => g.memberPorts)));
      }
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchPorts();
  }, [fetchPorts]);

  // Applies whatever the server actually persisted — including a partial success reported
  // via a 422 — rather than trusting an optimistic client-side guess.
  const applyServerPorts = (updated: PortRow[] | undefined) => {
    if (!updated || updated.length === 0) return;
    setPorts((cur) => {
      const byName = new Map(updated.map((p) => [p.name, p]));
      return cur.map((p) => (byName.has(p.name) ? { ...p, ...byName.get(p.name)! } : p));
    });
  };

  const savePort = async (name: string, data: Partial<Omit<PortRow, "name" | "status" | "deviceConfirmed">>) => {
    if (!deviceId) return;
    setSavingPort(name);
    setError("");
    try {
      const res = await api.updatePort(deviceId, name, data);
      applyServerPorts(res.data.data.ports);
      const failed = Object.entries(res.data.data.results ?? {}).find(([, r]) => !(r as FieldResult).applied);
      if (failed) setError(`${failed[0]}: ${(failed[1] as FieldResult).message || "rejected by device"}`);
    } catch (err) {
      const result = extractPortUpdateResult(err);
      applyServerPorts(result?.ports);
      const failed = Object.entries(result?.results ?? {}).find(([, r]) => !r.applied);
      setError(
        failed ? `${failed[0]}: ${failed[1].message || "rejected by device"}` : extractErrorMessage(err, `Failed to update ${name}`)
      );
    } finally {
      setSavingPort(null);
    }
  };

  const startEditDesc = (port: PortRow) => {
    setEditingDescFor(port.name);
    setDescDraft(port.description ?? "");
  };

  const commitEditDesc = async (name: string) => {
    await savePort(name, { description: descDraft.trim() || null });
    setEditingDescFor(null);
  };

  const visiblePorts = selectedPort ? ports.filter((p) => p.name === selectedPort) : ports;

  const portStatusExportColumns: ExportColumn<PortRow>[] = [
    { header: "Port", accessor: (p) => p.description || p.name },
    { header: "Enabled", accessor: (p) => (p.adminStatus === "up" ? "Enabled" : "Disabled") },
    { header: "Link Status", accessor: (p) => p.status },
    {
      header: `Tx Bytes${showRate && uptimeSeconds ? "/s" : ""}`,
      accessor: (p) => {
        const stat = telemetry?.interfaceStats.find((s) => s.port === p.name);
        const txBytes = stat ? parseFloat(stat.txBytes) : 0;
        const rate = showRate && uptimeSeconds ? uptimeSeconds : null;
        return rate ? `${formatBytes(txBytes / rate)}/s` : formatBytes(txBytes);
      },
    },
    {
      header: `Tx Packets${showRate && uptimeSeconds ? "/s" : ""}`,
      accessor: (p) => {
        const stat = telemetry?.interfaceStats.find((s) => s.port === p.name);
        const txPackets = stat ? parseFloat(stat.txPackets) : 0;
        const rate = showRate && uptimeSeconds ? uptimeSeconds : null;
        return rate ? (txPackets / rate).toFixed(1) : txPackets.toFixed(0);
      },
    },
    {
      header: `Rx Bytes${showRate && uptimeSeconds ? "/s" : ""}`,
      accessor: (p) => {
        const stat = telemetry?.interfaceStats.find((s) => s.port === p.name);
        const rxBytes = stat ? parseFloat(stat.rxBytes) : 0;
        const rate = showRate && uptimeSeconds ? uptimeSeconds : null;
        return rate ? `${formatBytes(rxBytes / rate)}/s` : formatBytes(rxBytes);
      },
    },
    {
      header: `Rx Packets${showRate && uptimeSeconds ? "/s" : ""}`,
      accessor: (p) => {
        const stat = telemetry?.interfaceStats.find((s) => s.port === p.name);
        const rxPackets = stat ? parseFloat(stat.rxPackets) : 0;
        const rate = showRate && uptimeSeconds ? uptimeSeconds : null;
        return rate ? (rxPackets / rate).toFixed(1) : rxPackets.toFixed(0);
      },
    },
  ];

  const trafficData = visiblePorts
    .filter((p) => p.status === "up")
    .map((p) => {
      const stat = telemetry?.interfaceStats.find((s) => s.port === p.name);
      return {
        port: p.name,
        tx: stat ? parseFloat(stat.txBytes) / 1024 : 0,
        rx: stat ? parseFloat(stat.rxBytes) / 1024 : 0,
      };
    });

  return (
    <div className="space-y-6">
      {/* Visual port map */}
      <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <h2 className="text-blue-700 dark:text-blue-400 font-bold text-base mb-4">Ports</h2>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-400 mb-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1">
              <PortShape state="up" />
              <span className="ring-2 ring-blue-500 rounded-sm" />
              <span>Selected</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold border border-gray-400 dark:border-slate-500 rounded px-1">
                AG
              </span>
              <span>AG Port</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold border border-gray-400 dark:border-slate-500 rounded px-1">
                T
              </span>
              <span>Trunk Port</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold border border-gray-400 dark:border-slate-500 rounded px-1">
                L3
              </span>
              <span>L3 Port</span>
            </div>
            <div className="flex items-center gap-1">
              <PortShape state="up" />
              <span>Up</span>
            </div>
            <div className="flex items-center gap-1">
              <PortShape state="shutdown" />
              <span>Shutdown</span>
            </div>
            <div className="flex items-center gap-1">
              <PortShape state="error-down" />
              <span>Error-down</span>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex items-center gap-1">
              <PortShape state="up" />
              <span>Copper</span>
            </div>
            <div className="flex items-center gap-1">
              <FiberPortShape />
              <span>Fiber</span>
            </div>
          </div>
        </div>

        {!deviceId ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
        ) : ports.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">No port data available</p>
        ) : (
          <div className="border border-gray-300 dark:border-slate-600 p-4 overflow-x-auto">
            <div className="flex gap-x-4 w-max">
              {ports.map((p) => {
                const state = portState(p);
                const isSelected = selectedPort === p.name;
                return (
                  <button
                    key={p.name}
                    onClick={() => setSelectedPort(isSelected ? null : p.name)}
                    className={`flex flex-col items-center gap-0.5 min-w-[2.5rem] px-1 py-1 rounded transition-colors ${
                      isSelected ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                  >
                    <div className="flex items-center gap-0.5 h-3">
                      {aggregatedPorts.has(p.name) && (
                        <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">AG</span>
                      )}
                      {p.portType === "trunk" && (
                        <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400">T</span>
                      )}
                    </div>
                    {isFiberPort(p.name) ? <FiberPortShape /> : <PortShape state={state} />}
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{portLabel(p.name)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Port status / Port Flow */}
      <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-700 mb-4">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setSubTab("status")}
              className={`pb-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                subTab === "status"
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              Port status
            </button>
            <button
              onClick={() => setSubTab("flow")}
              className={`pb-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                subTab === "flow"
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              Port Flow
            </button>
          </div>
          {subTab === "status" && (
            <div className="pb-2.5">
              <ExportButton
                filename="port-status"
                title="Port Status Report"
                columns={portStatusExportColumns}
                rows={visiblePorts}
              />
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        {!deviceId ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
        ) : loading ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
        ) : subTab === "status" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2 pr-3 font-medium">Port</th>
                  <th className="py-2 pr-3 font-medium">Enabled</th>
                  <th className="py-2 pr-3 font-medium">Link Status</th>
                  <th className="py-2 pr-3 font-medium">
                    Tx Bytes{showRate && uptimeSeconds ? "/s" : ""}
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    Tx Packets{showRate && uptimeSeconds ? "/s" : ""}
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    Rx Bytes{showRate && uptimeSeconds ? "/s" : ""}
                  </th>
                  <th className="py-2 pr-3 font-medium">
                    Rx Packets{showRate && uptimeSeconds ? "/s" : ""}
                  </th>
                  <th className="py-2 pr-3 font-medium">Drop Packets</th>
                  <th className="py-2 pr-3 font-medium">Drop Rate</th>
                  <th className="py-2 pr-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>Rate</span>
                      <button
                        role="switch"
                        aria-checked={showRate}
                        disabled={!uptimeSeconds}
                        title={uptimeSeconds ? "Show average rate since uptime start" : "Uptime unavailable"}
                        onClick={() => setShowRate((v) => !v)}
                        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors disabled:opacity-40 ${
                          showRate ? "bg-blue-600" : "bg-gray-300 dark:bg-slate-600"
                        }`}
                      >
                        <span
                          className="inline-block h-3 w-3 transform rounded-full bg-white transition-transform"
                          style={{ transform: showRate ? "translateX(14px)" : "translateX(2px)" }}
                        />
                      </button>
                    </div>
                  </th>
                  <th className="py-2 pr-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visiblePorts.map((p) => {
                  const isSaving = savingPort === p.name;
                  const stat = telemetry?.interfaceStats.find((s) => s.port === p.name);
                  const rxBytes = stat ? parseFloat(stat.rxBytes) : 0;
                  const txBytes = stat ? parseFloat(stat.txBytes) : 0;
                  const rxPackets = stat ? parseFloat(stat.rxPackets) : 0;
                  const txPackets = stat ? parseFloat(stat.txPackets) : 0;
                  const rate = showRate && uptimeSeconds ? uptimeSeconds : null;

                  return (
                    <tr key={p.name} className="border-b border-gray-100 dark:border-slate-700/60">
                      <td className="py-2 pr-3 text-gray-800 dark:text-gray-100">
                        {editingDescFor === p.name ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              autoFocus
                              value={descDraft}
                              onChange={(e) => setDescDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEditDesc(p.name);
                                if (e.key === "Escape") setEditingDescFor(null);
                              }}
                              className="border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs w-28 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                            />
                            <button
                              onClick={() => commitEditDesc(p.name)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingDescFor(null)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <XIcon size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{p.description || p.name}</span>
                            <button
                              onClick={() => startEditDesc(p)}
                              className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          role="switch"
                          aria-checked={p.adminStatus === "up"}
                          disabled={isSaving}
                          onClick={() =>
                            savePort(p.name, { adminStatus: p.adminStatus === "up" ? "down" : "up" })
                          }
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                            p.adminStatus === "up" ? "bg-green-500" : "bg-gray-300 dark:bg-slate-600"
                          }`}
                        >
                          <span
                            className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                            style={{
                              transform: p.adminStatus === "up" ? "translateX(18px)" : "translateX(2px)",
                            }}
                          />
                        </button>
                      </td>
                      <td className="py-2 pr-3 capitalize text-gray-800 dark:text-gray-100">{p.status}</td>
                      <td className="py-2 pr-3 text-gray-800 dark:text-gray-100">
                        {rate ? `${formatBytes(txBytes / rate)}/s` : formatBytes(txBytes)}
                      </td>
                      <td className="py-2 pr-3 text-gray-800 dark:text-gray-100">
                        {rate ? (txPackets / rate).toFixed(1) : txPackets.toFixed(0)}
                      </td>
                      <td className="py-2 pr-3 text-gray-800 dark:text-gray-100">
                        {rate ? `${formatBytes(rxBytes / rate)}/s` : formatBytes(rxBytes)}
                      </td>
                      <td className="py-2 pr-3 text-gray-800 dark:text-gray-100">
                        {rate ? (rxPackets / rate).toFixed(1) : rxPackets.toFixed(0)}
                      </td>
                      <td className="py-2 pr-3 text-gray-400 dark:text-gray-500">-</td>
                      <td className="py-2 pr-3 text-gray-400 dark:text-gray-500">-</td>
                      <td className="py-2 pr-3"></td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => setEditingPort(p)}
                          title="Port configuration"
                          className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <Settings2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visiblePorts.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-4 text-center text-gray-400 dark:text-gray-500">
                      No port data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : trafficData.length > 0 ? (
          <div className="h-56 w-full relative">
            <span className="text-xs text-gray-400 dark:text-gray-500 absolute top-0 left-4 z-10">KB</span>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficData} margin={{ top: 20, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="port" axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? "#1e293b" : "#ffffff",
                    border: `1px solid ${gridColor}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: isDark ? "#e5e7eb" : "#111827",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="tx" name="TX" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.7} />
                <Area type="monotone" dataKey="rx" name="RX" stroke="#5eead4" fill="#5eead4" fillOpacity={0.7} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 text-sm">No active ports to chart</p>
        )}
      </div>

      {editingPort && deviceId && (
        <EditPortConfigModal
          deviceId={deviceId}
          port={editingPort}
          onClose={() => setEditingPort(null)}
          onSaved={(updated) => {
            applyServerPorts(updated);
            const fresh = updated?.find((p) => p.name === editingPort.name);
            if (fresh) setEditingPort(fresh);
          }}
        />
      )}
    </div>
  );
};

// idle: field untouched since last successful save. pending: save in flight. applied: switch
// confirmed. failed: switch rejected (or timed out) — message holds the raw reply.
type FieldStatus = "idle" | "pending" | "applied" | "failed";

function EditPortConfigModal({
  deviceId,
  port,
  onClose,
  onSaved,
}: {
  deviceId: string;
  port: PortRow;
  onClose: () => void;
  onSaved: (updated?: PortRow[]) => void;
}) {
  const [portType, setPortType] = useState<PortType>(port.portType);
  const [vlanId, setVlanId] = useState(String(port.vlanId));
  const [speed, setSpeed] = useState<Speed>(port.speed);
  const [duplex, setDuplex] = useState<Duplex>(port.duplex);
  const [flowControl, setFlowControl] = useState<FlowControl>(port.flowControl);
  const [mtu, setMtu] = useState(String(port.mtu));
  const [medium, setMedium] = useState<Medium>(port.medium);
  const [sfpMode, setSfpMode] = useState<SfpMode | "">(port.sfpMode ?? "");
  const [autoneg, setAutoneg] = useState<Autoneg>(port.autoneg);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldStatus, setFieldStatus] = useState<Record<string, { status: FieldStatus; message?: string }>>({});

  const handleSave = async () => {
    const parsedVlan = parseInt(vlanId, 10);
    if (!vlanId || Number.isNaN(parsedVlan) || parsedVlan < 1 || parsedVlan > 4094) {
      setError("Enter a valid VLAN ID (1-4094)");
      return;
    }
    const parsedMtu = parseInt(mtu, 10);
    if (!mtu || Number.isNaN(parsedMtu) || parsedMtu < 46 || parsedMtu > 10222) {
      setError("Enter a valid MTU (46-10222)");
      return;
    }
    if (duplex === "half" && speed === "1000") {
      setError("Half duplex is not valid at 1000 Mbps");
      return;
    }

    // portType/vlanId now push live "switchport mode"/"switchport access vlan" commands
    // (VLAN feature) — only include them when actually changed here, otherwise every save
    // from this modal (even just a speed tweak) would silently re-push switchport mode/vlan
    // and could stomp trunk/hybrid allowed-list config set from the VLAN Configuration tab.
    const portTypeChanged = portType !== port.portType;
    const vlanIdChanged = parsedVlan !== port.vlanId;
    const livePushFields = [
      "adminStatus",
      "speed",
      "duplex",
      "flowControl",
      "mtu",
      "medium",
      "sfpMode",
      "autoneg",
      ...(portTypeChanged ? ["portType"] : []),
      ...(vlanIdChanged ? ["vlanId"] : []),
    ];
    setSaving(true);
    setError("");
    setFieldStatus(Object.fromEntries(livePushFields.map((f) => [f, { status: "pending" as FieldStatus }])));

    try {
      const res = await api.updatePort(deviceId, port.name, {
        ...(portTypeChanged ? { portType } : {}),
        ...(vlanIdChanged ? { vlanId: parsedVlan } : {}),
        speed,
        duplex,
        flowControl,
        mtu: parsedMtu,
        medium,
        ...(sfpMode ? { sfpMode } : {}),
        autoneg,
      });
      const results = (res.data.data.results ?? {}) as Record<string, FieldResult>;
      setFieldStatus(
        Object.fromEntries(
          livePushFields.map((f) => [
            f,
            results[f] ? { status: results[f].applied ? "applied" : "failed", message: results[f].message } : { status: "applied" },
          ])
        )
      );
      onSaved(res.data.data.ports);
      const anyFailed = Object.values(results).some((r) => !r.applied);
      if (!anyFailed) onClose();
    } catch (err) {
      const result = extractPortUpdateResult(err);
      const results = result?.results ?? {};
      setFieldStatus(
        Object.fromEntries(
          livePushFields.map((f) => [
            f,
            results[f] ? { status: results[f].applied ? "applied" : "failed", message: results[f].message } : { status: "idle" },
          ])
        )
      );
      if (result?.ports) onSaved(result.ports);
      setError(extractErrorMessage(err, "Failed to update port"));
    } finally {
      setSaving(false);
    }
  };

  const FieldBadge = ({ field }: { field: string }) => {
    const s = fieldStatus[field];
    if (!s || s.status === "idle") return null;
    if (s.status === "pending") return <span className="text-[10px] text-gray-400 ml-2">sending…</span>;
    if (s.status === "applied") return <span className="text-[10px] text-green-600 ml-2">✓ applied to device</span>;
    return <span className="text-[10px] text-red-500 ml-2">✗ {s.message || "rejected"}</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-sm p-6 border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {port.description || port.name} configuration
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <CloseIcon size={18} />
          </button>
        </div>
        {!port.deviceConfirmed && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3">
            Not confirmed on device — last saved config for this port was never acknowledged by the switch.
          </p>
        )}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Port Type</label>
            <select
              value={portType}
              onChange={(e) => setPortType(e.target.value as PortType)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="access">Access</option>
              <option value="trunk">Trunk</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">VLAN ID</label>
            <input
              type="number"
              value={vlanId}
              onChange={(e) => setVlanId(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Speed <FieldBadge field="speed" />
            </label>
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value as Speed)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="auto">auto</option>
              <option value="10">10M</option>
              <option value="100">100M</option>
              <option value="1000">1000M</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Duplex <FieldBadge field="duplex" />
            </label>
            <select
              value={duplex}
              onChange={(e) => setDuplex(e.target.value as Duplex)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="auto">auto</option>
              <option value="full">full</option>
              <option value="half">half</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Flow Control <FieldBadge field="flowControl" />
            </label>
            <select
              value={flowControl}
              onChange={(e) => setFlowControl(e.target.value as FlowControl)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="off">off</option>
              <option value="on">on</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              MTU <FieldBadge field="mtu" />
            </label>
            <input
              type="number"
              value={mtu}
              onChange={(e) => setMtu(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Medium <FieldBadge field="medium" />
            </label>
            <select
              value={medium}
              onChange={(e) => setMedium(e.target.value as Medium)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="copper">copper</option>
              <option value="fiber">fiber</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              SFP Port Mode <FieldBadge field="sfpMode" />
            </label>
            <select
              value={sfpMode}
              onChange={(e) => setSfpMode(e.target.value as SfpMode | "")}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">not set</option>
              <option value="sgmii">sgmii</option>
              <option value="2500BASE-X">2500BASE-X</option>
              <option value="1000BASE-X">1000BASE-X</option>
              <option value="10G">10G</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Auto-negotiation <FieldBadge field="autoneg" />
              <span className="block font-normal text-[11px] text-gray-400 normal-case">
                Applies to 1000M optical ports only
              </span>
            </label>
            <select
              value={autoneg}
              onChange={(e) => setAutoneg(e.target.value as Autoneg)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PortInfoTab;
