import { useEffect, useState } from "react";
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
import { Server, Building2, Activity, Bell } from "lucide-react";
import { api } from "../services/api";
import { useTheme } from "../context/ThemeContext";
import StatCard from "../component/StatCard";

interface Device {
  id: string;
  status: string;
  orgs?: { id: string; name: string } | null;
}

interface Alarm {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  status: string;
  triggeredAt: string;
  device: { id: string; name: string; serialNumber: string };
}

interface AlarmSummary {
  active: number;
  critical: number;
  warning: number;
  total: number;
}

const sparkOrgs = [{ v: 1 }, { v: 1 }, { v: 2 }, { v: 2 }, { v: 3 }, { v: 3 }, { v: 3 }];
const sparkTotal = [{ v: 100 }, { v: 110 }, { v: 105 }, { v: 115 }, { v: 120 }, { v: 118 }, { v: 128 }];
const sparkStatus = [{ v: 90 }, { v: 92 }, { v: 88 }, { v: 95 }, { v: 91 }, { v: 93 }, { v: 91 }];

const trafficData = [
  { time: "12:00", download: 800, upload: 300 },
  { time: "14:00", download: 950, upload: 400 },
  { time: "16:00", download: 1100, upload: 350 },
  { time: "18:00", download: 1300, upload: 500 },
  { time: "20:00", download: 900, upload: 450 },
  { time: "22:00", download: 700, upload: 250 },
  { time: "00:00", download: 500, upload: 200 },
  { time: "02:00", download: 400, upload: 150 },
  { time: "04:00", download: 450, upload: 180 },
  { time: "06:00", download: 600, upload: 220 },
  { time: "08:00", download: 850, upload: 350 },
];

const HEALTH_COLORS = ["#22c55e", "#ef4444"];

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const Dashboard = () => {
  // const user = getUser();
  const { theme } = useTheme();
  const [devices, setDevices] = useState<Device[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [alarmSummary, setAlarmSummary] = useState<AlarmSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAllDevices().then((res) => setDevices(res.data.data.devices)),
      api
        .getAllAlarms({ limit: 10})
        .then((res) => setAlarms(res.data.data.alarms)),
      api.getAlarmSummary().then((res) => setAlarmSummary(res.data.data)),
    ])
      .catch((err) => console.error("Dashboard data fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  const totalDevices = devices.length;
  const onlineDevices = devices.filter((d) => d.status === "online").length;
  const offlineDevices = totalDevices - onlineDevices;
  const onlinePct = totalDevices > 0 ? ((onlineDevices / totalDevices) * 100).toFixed(1) : "0";

  const orgMap = new Map<string, { name: string; up: number; down: number }>();
  devices.forEach((d) => {
    const orgName = d.orgs?.name || "Unassigned";
    const org = orgMap.get(orgName) || { name: orgName, up: 0, down: 0 };
    if (d.status === "online") org.up++;
    else org.down++;
    orgMap.set(orgName, org);
  });
  const orgData = Array.from(orgMap.values());

  const healthData = [
    { name: "Online", value: onlineDevices },
    { name: "Offline", value: offlineDevices },
  ];
  const isDark = theme === "dark";
  const axisColor = isDark ? "#9ca3af" : "#6b7280";
  const gridColor = isDark ? "#334155" : "#e5e7eb";
  const tooltipBg = isDark ? "#1e293b" : "#ffffff";
  const tooltipBorder = isDark ? "#475569" : "#e5e7eb";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Welcome
      <div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
          Welcome back, {user?.name || "User"}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
          Role: {user?.role || "-"}
          {user?.orgs ? ` | ${user.orgs.name}` : ""}
        </p>
      </div> */}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Organizations"
          value={orgData.length}
          subtitle="Registered Organizations"
          icon={<Building2 size={20} />}
          color="purple"
          sparkData={sparkOrgs}
        />
        <StatCard
          title="Total Devices"
          value={totalDevices}
          subtitle="All Registered Devices"
          icon={<Server size={20} />}
          color="blue"
          sparkData={sparkTotal}
        />
        <StatCard
          title="Online / Offline"
          value={`${onlineDevices} / ${offlineDevices}`}
          subtitle={`${onlinePct}% online`}
          icon={<Activity size={20} />}
          color="green"
          sparkData={sparkStatus}
        />
        <StatCard
          title="Total Alarms"
          value={alarmSummary?.active ?? 0}
          subtitle={`${alarmSummary?.critical ?? 0} critical, ${alarmSummary?.warning ?? 0} warning`}
          icon={<Bell size={20} />}
          color="amber"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Network Overview */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-100">
              Network Overview
            </h2>
            <select className="text-[10px] border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded px-2 py-1 focus:outline-none">
              <option>Traffic</option>
              <option>Bandwidth</option>
              <option>Latency</option>
            </select>
          </div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="downloadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="uploadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: 9 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: axisColor, fontSize: 9 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}G` : `${v}M`} />
                <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, color: isDark ? "#e5e7eb" : "#1f2937", fontSize: 11 }} formatter={(value) => [`${value} Mbps`]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="download" stroke="#3b82f6" fill="url(#downloadGrad)" strokeWidth={1.5} dot={false} name="Download" />
                <Area type="monotone" dataKey="upload" stroke="#22c55e" fill="url(#uploadGrad)" strokeWidth={1.5} dot={false} name="Upload" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Device Health */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 transition-colors">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
            Device Health
          </h2>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={healthData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={68}
                  dataKey="value"
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}   
                  label={({ name, value, x, y }) => (
                    <text x={x} y={y} textAnchor="middle" fill={isDark ? "#d1d5db" : "#374151"} fontSize={10}>
                      <tspan x={x} dy={0}>{name}</tspan>
                      <tspan x={x} dy={12} fontWeight="bold">{value}</tspan>
                    </text>
                  )}
                  labelLine={{ stroke: isDark ? "#6b7280" : "#9ca3af", strokeWidth: 1 }}
                >
                  {healthData.map((_entry, index) => (
                    <Cell key={index} fill={HEALTH_COLORS[index]} />
                  ))}
                </Pie>
                <Legend
                  wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                  formatter={(value) => <span className="text-gray-600 dark:text-gray-300">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Alarms */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            Recent Alarms
          </h2>
          <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            View All
          </button>
        </div>
        <div className="space-y-3">
          {alarms.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">No active alarms.</p>
          )}
          {alarms.map((alarm) => (
            <div
              key={alarm.id}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${severityDot[alarm.severity]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {alarm.message}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {alarm.device?.name} &middot; {alarm.type}
                </p>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {new Date(alarm.triggeredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
