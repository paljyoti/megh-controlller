import { useNavigate } from "react-router-dom";
import { X, ExternalLink, ArrowDown, ArrowUp } from "lucide-react";
import type { TopologyNode, TopologyEdge } from "../../services/topologyApi";
import { formatRate, shortPort } from "../../services/topologyApi";
import { STATUS_DOT } from "./types";

// Slide-in detail panel for the selected node — sheet #25 "neighbors, neighbor IP, neighbor
// interface, statistics, device vendor, model".

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 dark:border-slate-700/60 last:border-0">
    <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-xs font-medium text-gray-800 dark:text-gray-100 text-right break-all">
      {value}
    </span>
  </div>
);

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
  const links = edges.filter((e) => e.source === node.id || e.target === node.id);

  return (
    <div className="absolute top-4 right-4 w-80 max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-10">
      <div className="flex items-start justify-between p-4 border-b border-gray-100 dark:border-slate-700">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{node.label}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 capitalize flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[node.status]}`} />
            {node.type === "switch" ? "Managed switch" : node.type === "cloud" ? "Upstream network" : node.sameVendor ? "Switch (same vendor, not onboarded)" : "End device"}
            {" · "}
            {node.status}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4">
        {node.type === "switch" && (
          <>
            <Row label="Model" value={node.model ?? "—"} />
            <Row label="Serial" value={node.serialNumber ?? "—"} />
            <Row label="IP address" value={node.ipAddress ?? "—"} />
            <Row label="MAC" value={<span className="font-mono">{node.macAddress ?? "—"}</span>} />
            <Row label="Firmware" value={node.softwareVersion ?? "—"} />
            <Row label="Active alarms" value={node.activeAlarms ?? 0} />
            <button
              onClick={() => navigate(`/devices/${node.deviceId}`)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Open device <ExternalLink size={14} />
            </button>
          </>
        )}
        {node.type === "cloud" && (
          <>
            <Row label="Devices behind" value={node.macCount ?? 0} />
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
        {links.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">No links discovered yet.</p>
        )}
        <div className="space-y-2">
          {links.map((e) => {
            const isSource = e.source === node.id;
            const other = nodesById.get(isSource ? e.target : e.source);
            const localPort = isSource ? e.sourcePort : e.targetPort;
            const remotePort = isSource ? e.targetPort : e.sourcePort;
            return (
              <div
                key={e.id}
                className="rounded-lg border border-gray-100 dark:border-slate-700 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                    {other?.label ?? "?"}
                  </span>
                  <span
                    className={`text-[10px] uppercase font-semibold ${
                      e.status === "up" ? "text-green-600 dark:text-green-400" : e.status === "down" ? "text-red-600 dark:text-red-400" : "text-gray-400"
                    }`}
                  >
                    {e.status}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                  {localPort ? shortPort(localPort) : "?"} ↔ {remotePort ? shortPort(remotePort) : "?"}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-600 dark:text-gray-300">
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
      </div>
    </div>
  );
};

export default NodePanel;
