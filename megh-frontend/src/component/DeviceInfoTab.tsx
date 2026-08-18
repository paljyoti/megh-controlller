import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import TemperatureGauge from "./TemperatureGauge";
import type { TelemetryData } from "../types/device";

const CPU_COLORS = ["#0ea5e9", "#e5e7eb"];
const MEM_COLORS = ["#0ea5e9", "#e5e7eb"];

const DeviceInfoTab = ({ telemetry }: { telemetry: TelemetryData | null }) => {
  const cpuVal = telemetry ? parseFloat(telemetry.cpuUsage) || 0 : 0;
  const memVal = telemetry ? parseFloat(telemetry.memoryUsage) || 0 : 0;
  const tempVal = telemetry ? parseFloat(telemetry.temperature) || 0 : 0;
  const cpuData = [
    { name: "Used", value: cpuVal },
    { name: "Free", value: 100 - cpuVal },
  ];
  const memData = [
    { name: "Used", value: memVal },
    { name: "Free", value: 100 - memVal },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-6 bg-white dark:bg-slate-800 flex flex-col items-center">
        <h3 className="text-sm font-semibold mb-4 text-gray-800 dark:text-gray-100">CPU</h3>
        <div className="h-40 w-40 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={cpuData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                dataKey="value"
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                {cpuData.map((_entry, index) => (
                  <Cell key={index} fill={CPU_COLORS[index]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-blue-600 font-semibold text-lg">
              {cpuVal.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Used: <span className="font-semibold text-gray-700 dark:text-gray-200">{cpuVal.toFixed(2)} %</span>{" "}
          Total: <span className="font-semibold text-gray-700 dark:text-gray-200">100 %</span>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-6 bg-white dark:bg-slate-800 flex flex-col items-center">
        <h3 className="text-sm font-semibold mb-4 text-gray-800 dark:text-gray-100">Memory</h3>
        <div className="h-40 w-40 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={memData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                dataKey="value"
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                {memData.map((_entry, index) => (
                  <Cell key={index} fill={MEM_COLORS[index]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-blue-600 font-semibold text-lg">
              {memVal.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Used: <span className="font-semibold text-gray-700 dark:text-gray-200">{memVal.toFixed(2)} %</span>{" "}
          Total: <span className="font-semibold text-gray-700 dark:text-gray-200">100 %</span>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-6 bg-white dark:bg-slate-800 flex flex-col items-center">
        <h3 className="text-sm font-semibold mb-4 text-gray-800 dark:text-gray-100">Temperature</h3>
        <TemperatureGauge value={tempVal} />
      </div>
    </div>
  );
};

export default DeviceInfoTab;
