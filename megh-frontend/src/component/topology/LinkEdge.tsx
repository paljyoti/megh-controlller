import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { formatRate, shortPort, type TopologyEdge } from "../../services/topologyApi";
import type { FlowEdge } from "./types";

// A link between two nodes: coloured by interface status, thickness by traffic, port labels
// at each end, and a hover tooltip with rx/tx rate — sheet #25 "traffic utilisation, interface
// status & details on hovering over the link".

const STATUS_STROKE: Record<TopologyEdge["status"], string> = {
  up: "#22c55e",
  down: "#ef4444",
  unknown: "#9ca3af",
};

// 1.5px idle → 5px at ~10 MB/s so busy links stand out without needing a legend.
const widthFor = (rx: number | null, tx: number | null) => {
  const total = (rx ?? 0) + (tx ?? 0);
  if (total <= 0) return 1.5;
  return Math.min(5, 1.5 + Math.log10(1 + total / 1024) * 1.1);
};

const LinkEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<FlowEdge>) => {
  const [hover, setHover] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });
  if (!data) return <BaseEdge id={id} path={edgePath} />;

  const stroke = STATUS_STROKE[data.status];
  const width = widthFor(data.rxBps, data.txBps);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth: hover ? width + 1.5 : width,
          opacity: data.dimmed ? 0.15 : 1,
          strokeDasharray: data.status === "down" ? "6 4" : undefined,
          transition: "stroke-width 120ms",
        }}
      />
      {/* Wide invisible path so the link is easy to hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ cursor: "pointer" }}
      />
      <EdgeLabelRenderer>
        {/* Port labels at each end */}
        <div
          className={`absolute pointer-events-none text-[10px] font-mono px-1 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 ${data.dimmed ? "opacity-20" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${sourceX}px, ${sourceY + 14}px)` }}
        >
          {shortPort(data.sourcePort)}
        </div>
        {data.targetPort && (
          <div
            className={`absolute pointer-events-none text-[10px] font-mono px-1 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 ${data.dimmed ? "opacity-20" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${targetX}px, ${targetY - 14}px)` }}
          >
            {shortPort(data.targetPort)}
          </div>
        )}

        {hover && (
          <div
            className="absolute z-50 pointer-events-none rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-200 w-max max-w-[260px]"
            style={{ transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 10}px)` }}
          >
            <p className="font-semibold text-gray-800 dark:text-gray-100">
              {data.sourceLabel} <span className="font-mono text-gray-500">{shortPort(data.sourcePort)}</span>
              {" ↔ "}
              {data.targetLabel}
              {data.targetPort && (
                <span className="font-mono text-gray-500"> {shortPort(data.targetPort)}</span>
              )}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: stroke }}
              />
              <span className="uppercase font-medium">{data.status}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500 dark:text-gray-400">
                via {data.via === "lldp" ? "LLDP" : "MAC table"}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1">
                <ArrowDown size={12} className="text-blue-500" /> {formatRate(data.rxBps)}
              </span>
              <span className="flex items-center gap-1">
                <ArrowUp size={12} className="text-green-500" /> {formatRate(data.txBps)}
              </span>
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};

export default LinkEdge;
