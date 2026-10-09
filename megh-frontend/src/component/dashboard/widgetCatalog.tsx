import { useEffect, useState, type ReactNode } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { api } from "../../services/api";

export type WidgetType =
  | "deviceSummary"
  | "alarmSummary"
  | "recentAlarms"
  | "networkTraffic"
  | "deviceHealth"
  | "recentEvents"
  | "hostStatistics";

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  deviceId?: string;
  layout: { x: number; y: number; w: number; h: number };
}

export interface CatalogEntry {
  type: WidgetType;
  label: string;
  defaultSize: { w: number; h: number };
  needsDevice?: boolean;
}

export const WIDGET_CATALOG: CatalogEntry[] = [
  { type: "deviceSummary", label: "Device Summary", defaultSize: { w: 3, h: 2 } },
  { type: "alarmSummary", label: "Alarm Summary", defaultSize: { w: 3, h: 2 } },
  { type: "deviceHealth", label: "Device Health", defaultSize: { w: 4, h: 4 } },
  { type: "networkTraffic", label: "Network Traffic", defaultSize: { w: 8, h: 4 } },
  { type: "recentAlarms", label: "Recent Alarms (Host Problems)", defaultSize: { w: 6, h: 5 } },
  { type: "recentEvents", label: "Recent Events", defaultSize: { w: 6, h: 5 }, needsDevice: true },
  { type: "hostStatistics", label: "Host Statistics", defaultSize: { w: 4, h: 3 }, needsDevice: true },
];

export const catalogLabel = (type: WidgetType) =>
  WIDGET_CATALOG.find((c) => c.type === type)?.label ?? type;

// Shared, dashboard-wide data every non-device-specific widget draws from — fetched once by
// CustomDashboard and passed down, rather than each widget re-fetching the same thing.
export interface SharedDashboardData {
  devices: { id: string; name?: string; status: string }[];
  alarms: {
    id: string;
    type: string;
    severity: "critical" | "warning" | "info";
    message: string;
    triggeredAt: string;
    device: { id: string; name: string };
  }[];
  alarmSummary: { active: number; critical: number; warning: number; total: number } | null;
  trafficData: { time: string; download: number; upload: number }[];
}

const HEALTH_COLORS = ["#22c55e", "#ef4444"];
const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="h-full flex flex-col p-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 shrink-0">{title}</h3>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

function DeviceSummaryWidget({ data }: { data: SharedDashboardData }) {
  const total = data.devices.length;
  const online = data.devices.filter((d) => d.status === "online").length;
  return (
    <Card title="Device Summary">
      <div className="flex items-center gap-6">
        <div>
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{total}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Total devices</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{online}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Online</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-500">{total - online}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Offline</div>
        </div>
      </div>
    </Card>
  );
}

function AlarmSummaryWidget({ data }: { data: SharedDashboardData }) {
  const s = data.alarmSummary;
  return (
    <Card title="Alarm Summary">
      <div className="flex items-center gap-6">
        <div>
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{s?.total ?? 0}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Total</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-amber-500">{s?.active ?? 0}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Active</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-500">{s?.critical ?? 0}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Critical</div>
        </div>
      </div>
    </Card>
  );
}

function DeviceHealthWidget({ data }: { data: SharedDashboardData }) {
  const online = data.devices.filter((d) => d.status === "online").length;
  const healthData = [
    { name: "Online", value: online },
    { name: "Offline", value: data.devices.length - online },
  ];
  return (
    <Card title="Device Health">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={healthData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" stroke="none">
            {healthData.map((_e, i) => (
              <Cell key={i} fill={HEALTH_COLORS[i]} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

function NetworkTrafficWidget({ data }: { data: SharedDashboardData }) {
  if (data.trafficData.length === 0) {
    return (
      <Card title="Network Traffic">
        <div className="h-full flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">
          No traffic data yet
        </div>
      </Card>
    );
  }
  return (
    <Card title="Network Traffic">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.trafficData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
          <Tooltip formatter={(value) => [`${value} Mbps`]} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Area type="monotone" dataKey="download" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} strokeWidth={1.5} name="Download" />
          <Area type="monotone" dataKey="upload" stroke="#22c55e" fill="#22c55e" fillOpacity={0.25} strokeWidth={1.5} name="Upload" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

function RecentAlarmsWidget({ data }: { data: SharedDashboardData }) {
  return (
    <Card title="Recent Alarms">
      {data.alarms.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No active alarms.</p>
      ) : (
        <div className="space-y-2">
          {data.alarms.map((a) => (
            <div key={a.id} className="flex items-start gap-2">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${severityDot[a.severity]}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{a.message}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{a.device?.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RecentEventsWidget({ deviceId }: { deviceId?: string }) {
  const [events, setEvents] = useState<{ id: string; event: string; port: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!deviceId) return;
    setLoading(true);
    api
      .getDeviceEvents(deviceId, 10)
      .then((res) => setEvents(res.data.data.events))
      .finally(() => setLoading(false));
  }, [deviceId]);

  if (!deviceId) return <Card title="Recent Events"><p className="text-xs text-gray-400">Pick a device in edit mode.</p></Card>;
  return (
    <Card title="Recent Events">
      {loading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-gray-400">No events recorded.</p>
      ) : (
        <div className="space-y-1.5">
          {events.map((e) => (
            <div key={e.id} className="text-xs flex justify-between gap-2">
              <span className={e.event === "port_down" ? "text-red-500" : "text-gray-700 dark:text-gray-200"}>
                {e.event}{e.port ? ` — ${e.port}` : ""}
              </span>
              <span className="text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function HostStatisticsWidget({ deviceId }: { deviceId?: string }) {
  const [telemetry, setTelemetry] = useState<{ cpuUsage: string; memoryUsage: string; temperature: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!deviceId) return;
    setLoading(true);
    api
      .getDeviceTelemetry(deviceId)
      .then((res) => setTelemetry(res.data.data.telemetry))
      .catch(() => setTelemetry(null))
      .finally(() => setLoading(false));
  }, [deviceId]);

  if (!deviceId) return <Card title="Host Statistics"><p className="text-xs text-gray-400">Pick a device in edit mode.</p></Card>;
  return (
    <Card title="Host Statistics">
      {loading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : !telemetry ? (
        <p className="text-xs text-gray-400">No telemetry yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{parseFloat(telemetry.cpuUsage) || 0}%</div>
            <div className="text-[10px] text-gray-400">CPU</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{parseFloat(telemetry.memoryUsage) || 0}%</div>
            <div className="text-[10px] text-gray-400">Memory</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{parseFloat(telemetry.temperature) || 0}°C</div>
            <div className="text-[10px] text-gray-400">Temp</div>
          </div>
        </div>
      )}
    </Card>
  );
}

export function WidgetRenderer({
  widget,
  data,
}: {
  widget: WidgetInstance;
  data: SharedDashboardData;
}) {
  switch (widget.type) {
    case "deviceSummary":
      return <DeviceSummaryWidget data={data} />;
    case "alarmSummary":
      return <AlarmSummaryWidget data={data} />;
    case "deviceHealth":
      return <DeviceHealthWidget data={data} />;
    case "networkTraffic":
      return <NetworkTrafficWidget data={data} />;
    case "recentAlarms":
      return <RecentAlarmsWidget data={data} />;
    case "recentEvents":
      return <RecentEventsWidget deviceId={widget.deviceId} />;
    case "hostStatistics":
      return <HostStatisticsWidget deviceId={widget.deviceId} />;
    default:
      return null;
  }
}
