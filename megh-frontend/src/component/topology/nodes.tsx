import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Server, Cloud, Monitor, Bell } from "lucide-react";
import { STATUS_DOT, STATUS_RING, type FlowNode, type FlowNodeData } from "./types";

// Custom React Flow nodes for the topology map. Kept in one file since they share the same
// card styling as the rest of the app (white / slate-800, gray-200 / slate-700 borders).
// Types/constants live in ./types.ts and the nodeTypes map in ./registry.ts so this file only
// exports components (react-refresh rule).

const shell = (d: FlowNodeData, extra = "") =>
  `rounded-xl border-2 bg-white dark:bg-slate-800 shadow-sm transition-all ${STATUS_RING[d.status]} ${
    d.highlighted ? "ring-4 ring-blue-400/60 scale-105" : ""
  } ${d.dimmed ? "opacity-30" : "opacity-100"} ${extra}`;

const handles = (
  <>
    <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-2 !h-2 !border-0" />
    <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2 !border-0" />
  </>
);

export const SwitchNode = ({ data }: NodeProps<FlowNode>) => (
  <div className={shell(data, "px-4 py-3 min-w-[190px]")}>
    {handles}
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
        <Server size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{data.label}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
          {data.model} · {data.ipAddress?.split("/")[0] ?? "no IP"}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2 mt-2 text-[11px]">
      <span className={`w-2 h-2 rounded-full ${STATUS_DOT[data.status]}`} />
      <span className="capitalize text-gray-600 dark:text-gray-300">{data.status}</span>
      {(data.activeAlarms ?? 0) > 0 && (
        <span className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
          <Bell size={10} /> {data.activeAlarms}
        </span>
      )}
    </div>
  </div>
);

export const CloudNode = ({ data }: NodeProps<FlowNode>) => (
  <div className={shell(data, "px-4 py-3 min-w-[170px] border-dashed")}>
    {handles}
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
        <Cloud size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{data.label}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {data.macCount} devices{data.vlanId !== undefined ? ` · VLAN ${data.vlanId}` : ""}
        </p>
      </div>
    </div>
    {data.sameVendor && (
      <p className="mt-1.5 text-[10px] text-purple-600 dark:text-purple-400">
        includes same-vendor switches (not onboarded)
      </p>
    )}
  </div>
);

export const HostNode = ({ data }: NodeProps<FlowNode>) => (
  <div className={shell(data, "px-3 py-2 min-w-[150px]")}>
    {handles}
    <div className="flex items-center gap-2">
      <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
        {data.sameVendor ? <Server size={16} /> : <Monitor size={16} />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 font-mono">{data.mac}</p>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">
          {data.sameVendor ? "Switch (same vendor)" : "End device"}
          {data.vlanId !== undefined ? ` · VLAN ${data.vlanId}` : ""}
        </p>
      </div>
    </div>
  </div>
);
