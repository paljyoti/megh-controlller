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
import { useTheme } from "../context/ThemeContext";
import type { TelemetryData } from "../types/device";

function PortIcon({ status, flipped = false }: { status: "up" | "down"; flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 490 490"
      className={`mt-2 w-10 h-10 ${status === "up" ? "text-green-500" : "text-gray-400 dark:text-slate-600"} ${flipped ? "rotate-180" : ""}`}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0,0v490h490V0H0z M430.1,332.9h-87.5v50.9h-33.1v50.9H180.4v-50.6h-33.1v-51.3H59.9v-278h46.7v66.5h38.5V54.8h40.8v66.5 h38.5V54.8h40.8v66.5h38.5V54.8h40.8v66.5H383V54.8h46.7v278.1L430.1,332.9L430.1,332.9z" />
    </svg>
  );
}

function FiberPortIcon() {
  return (
    <svg
      viewBox="0 0 56 56"
      className="w-10 h-10 text-gray-400 dark:text-slate-600"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 7.7148 49.5742 L 48.2852 49.5742 C 53.1836 49.5742 55.6446 47.1367 55.6446 42.3086 L 55.6446 13.6914 C 55.6446 8.8633 53.1836 6.4258 48.2852 6.4258 L 7.7148 6.4258 C 2.8398 6.4258 .3554 8.8398 .3554 13.6914 L .3554 42.3086 C .3554 47.1602 2.8398 49.5742 7.7148 49.5742 Z M 7.7851 45.8008 C 5.4413 45.8008 4.1288 44.5586 4.1288 42.1211 L 4.1288 13.8789 C 4.1288 11.4414 5.4413 10.1992 7.7851 10.1992 L 48.2147 10.1992 C 50.5350 10.1992 51.8708 11.4414 51.8708 13.8789 L 51.8708 42.1211 C 51.8708 44.5586 50.5350 45.8008 48.2147 45.8008 Z" />
    </svg>
  );
}

function portNumber(port: string): number {
  const match = port.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function portLabel(port: string): string {
  const match = port.match(/(\d+)$/);
  return match ? match[1] : port;
}

function isCopperPort(port: string): boolean {
  const name = port.toLowerCase();
  return (
    name.startsWith("gigabitethernet") ||
    name.startsWith("fastethernet") ||
    name.startsWith("ethernet")
  );
}

function isFiberPort(port: string): boolean {
  const name = port.toLowerCase();
  return (
    name.startsWith("tengigabitethernet") ||
    name.startsWith("xgigabit") ||
    name.startsWith("sfp")
  );
}

const PortInfoTab = ({ telemetry }: { telemetry: TelemetryData | null }) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const axisColor = isDark ? "#9ca3af" : "#6b7280";
  const gridColor = isDark ? "#334155" : "#e5e7eb";

  const allStats = telemetry?.interfaceStats || [];
  const copperPorts = allStats
    .filter((s) => isCopperPort(s.port))
    .sort((a, b) => portNumber(a.port) - portNumber(b.port));
  const fiberPorts = allStats
    .filter((s) => isFiberPort(s.port))
    .sort((a, b) => portNumber(a.port) - portNumber(b.port));

  const toColumns = (ports: typeof allStats) => {
    const cols: (typeof allStats)[number][][] = [];
    for (let i = 0; i < ports.length; i += 2) {
      cols.push(ports.slice(i, i + 2));
    }
    return cols;
  };
  const copperColumns = toColumns(copperPorts);

  const trafficData = [...copperPorts, ...fiberPorts]
    .filter((s) => s.status === "up")
    .map((s) => ({
      port: s.port,
      tx: parseFloat(s.txBytes) / 1024,
      rx: parseFloat(s.rxBytes) / 1024,
    }));

  return (
    <div className="space-y-6">
      {/* Ethernet Ports */}
      <div>
        <h2 className="text-blue-700 dark:text-blue-400 font-bold text-base mb-6">Ports</h2>
        <div className="bg-white dark:bg-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3 ml-2 text-xs text-gray-600 dark:text-gray-400 mb-3">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1">
                <PortIcon status="down" />
                <span>Selected</span>
              </div>
              <div className="flex items-center gap-1">
                <PortIcon status="down" />
                <span>AG Port</span>
              </div>
              <div className="flex items-center gap-1">
                <PortIcon status="down" />
                <span>Trunk Port</span>
              </div>
              <div className="flex items-center gap-1">
                <PortIcon status="down" />
                <span>L3 Port</span>
              </div>
              <div className="flex items-center gap-1">
                <PortIcon status="up" />
                <span>Up</span>
              </div>
              <div className="flex items-center gap-1">
                <PortIcon status="down" />
                <span>Shutdown</span>
              </div>
              <div className="flex items-center gap-1">
                <PortIcon status="down" />
                <span>Error-down</span>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex items-center gap-1">
                <PortIcon status="down" />
                <span>Copper</span>
              </div>
              <div className="flex items-center gap-1">
                <FiberPortIcon />
                <span>Fiber</span>
              </div>
            </div>
          </div>

          <div className="border border-gray-300 dark:border-slate-600 p-4">
            {copperColumns.length > 0 || fiberPorts.length > 0 ? (
              <div className="flex flex-col gap-1">
                <div className="flex gap-x-4">
                  {copperColumns.map((col, idx) =>
                    col[0] ? (
                      <div key={`top-${idx}`} className="flex flex-col items-center gap-0.5 min-w-[2rem]">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">{portLabel(col[0].port)}</span>
                        <PortIcon status={col[0].status === "up" ? "up" : "down"} />
                      </div>
                    ) : null
                  )}
                </div>
                <div className="flex gap-x-4">
                  {copperColumns.map((col, idx) =>
                    col[1] ? (
                      <div key={`bottom-copper-${idx}`} className="flex flex-col items-center gap-0.5 min-w-[2rem]">
                        <PortIcon status={col[1].status === "up" ? "up" : "down"} />
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">{portLabel(col[1].port)}</span>
                      </div>
                    ) : null
                  )}
                  {fiberPorts.map((p) => (
                    <div key={`bottom-fiber-${p.port}`} className="flex flex-col items-center gap-0.5 min-w-[2rem]">
                      <FiberPortIcon />
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{portLabel(p.port)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-400 dark:text-gray-500 text-sm">No port data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Traffic */}
      {trafficData.length > 0 && (
        <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h2 className="text-blue-700 dark:text-blue-400 font-bold text-base mb-4">Traffic</h2>
          <div className="h-48 w-full relative">
            <span className="text-xs text-gray-400 dark:text-gray-500 absolute top-0 left-4 z-10">
              KB
            </span>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trafficData}
                margin={{ top: 20, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={gridColor}
                />
                <XAxis
                  dataKey="port"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: axisColor, fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: axisColor, fontSize: 11 }}
                />
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
                <Area
                  type="monotone"
                  dataKey="tx"
                  name="TX"
                  stroke="#60a5fa"
                  fill="#60a5fa"
                  fillOpacity={0.7}
                />
                <Area
                  type="monotone"
                  dataKey="rx"
                  name="RX"
                  stroke="#5eead4"
                  fill="#5eead4"
                  fillOpacity={0.7}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortInfoTab;
