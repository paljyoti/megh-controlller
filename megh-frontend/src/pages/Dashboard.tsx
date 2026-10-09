import { useEffect, useState } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
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
import { Server, Building2, Activity, Bell, LayoutGrid, Save, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useTheme } from "../context/ThemeContext";
import StatCard from "../component/StatCard";

const ResponsiveGridLayout = WidthProvider(Responsive);

// Each dashboard section is one grid item. The default positions below are the Standard layout
// (12-column grid, rowHeight 50px). A user's saved layout only overrides these positions.
const DEFAULT_LAYOUT: Layout[] = [
  { i: "statOrgs", x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "statDevices", x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "statStatus", x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "statAlarms", x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "networkOverview", x: 0, y: 2, w: 8, h: 4, minW: 3, minH: 3 },
  { i: "deviceHealth", x: 8, y: 2, w: 4, h: 4, minW: 2, minH: 3 },
  { i: "recentAlarms", x: 0, y: 6, w: 12, h: 8, minW: 4, minH: 4 },
];

// Saved as [{ id, layout: { x, y, w, h } }] for the logged-in user. Unknown or missing ids fall
// back to the default position, so the Standard layout is always complete.
const mergeSavedLayout = (saved: { id: string; layout: { x: number; y: number; w: number; h: number } }[] | null) =>
  DEFAULT_LAYOUT.map((d) => {
    const s = saved?.find((item) => item.id === d.i);
    return s ? { ...d, x: s.layout.x, y: s.layout.y, w: s.layout.w, h: s.layout.h } : d;
  });

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

// Real telemetry-derived point (see api.getNetworkOverview) — hourly Mbps averages over the
// last 24h, only for hours with actual data.
interface TrafficPoint {
  time: string;
  download: number;
  upload: number;
}

const sparkOrgs = [{ v: 1 }, { v: 1 }, { v: 2 }, { v: 2 }, { v: 3 }, { v: 3 }, { v: 3 }];
const sparkTotal = [{ v: 100 }, { v: 110 }, { v: 105 }, { v: 115 }, { v: 120 }, { v: 118 }, { v: 128 }];
const sparkStatus = [{ v: 90 }, { v: 92 }, { v: 88 }, { v: 95 }, { v: 91 }, { v: 93 }, { v: 91 }];

const HEALTH_COLORS = ["#22c55e", "#ef4444"];

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const Dashboard = () => {
  // const user = getUser();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [devices, setDevices] = useState<Device[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [alarmSummary, setAlarmSummary] = useState<AlarmSummary | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Section layout — savedLayout is the user's saved positions (or the default). draftLayout holds
  // in-progress changes while editing, so Cancel can discard them.
  const [savedLayout, setSavedLayout] = useState<Layout[]>(DEFAULT_LAYOUT);
  const [draftLayout, setDraftLayout] = useState<Layout[]>(DEFAULT_LAYOUT);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const [breakpoint, setBreakpoint] = useState("lg");

  useEffect(() => {
    api
      .getDashboardLayout()
      .then((res) => setSavedLayout(mergeSavedLayout(res.data.data.widgets)))
      .catch(() => setSavedLayout(DEFAULT_LAYOUT))
      .finally(() => setLayoutLoaded(true));
  }, []);

  useEffect(() => {
    Promise.all([
      api.getAllDevices().then((res) => setDevices(res.data.data.devices)),
      api
        .getAllAlarms({ limit: 10})
        .then((res) => setAlarms(res.data.data.alarms)),
      api.getAlarmSummary().then((res) => setAlarmSummary(res.data.data)),
      api.getNetworkOverview().then((res) => setTrafficData(res.data.data.overview)),
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

  if (loading || !layoutLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  // Only the 12-column (lg) layout is edited and saved. Smaller screens use RGL's generated
  // layout, so edits made there are ignored.
  const handleLayoutChange = (newLayout: Layout[]) => {
    if (editing && breakpoint === "lg") setDraftLayout(newLayout);
  };

  const startEditing = () => {
    setDraftLayout(savedLayout);
    setLayoutError("");
    setEditing(true);
  };

  // Cancel just leaves edit mode; the grid goes back to savedLayout, so nothing changes.
  const cancelEditing = () => {
    setEditing(false);
    setLayoutError("");
  };

  const handleSaveLayout = async () => {
    setSaving(true);
    setLayoutError("");
    try {
      await api.saveDashboardLayout(
        draftLayout.map((l) => ({ id: l.i, layout: { x: l.x, y: l.y, w: l.w, h: l.h } }))
      );
      setSavedLayout(draftLayout);
      setEditing(false);
    } catch {
      setLayoutError("Failed to save layout");
    } finally {
      setSaving(false);
    }
  };

  const handleResetLayout = async () => {
    if (!confirm("Reset the dashboard layout to the default?")) return;
    setSaving(true);
    setLayoutError("");
    try {
      await api.resetDashboardLayout();
      setSavedLayout(DEFAULT_LAYOUT);
      setDraftLayout(DEFAULT_LAYOUT);
      setEditing(false);
    } catch {
      setLayoutError("Failed to reset layout");
    } finally {
      setSaving(false);
    }
  };

  // In edit mode the section content ignores clicks, so "View All" and similar buttons do not fire
  // while the user is dragging. The grid item itself still receives the drag.
  const sectionBody = (child: React.ReactNode) => (
    <div className={`h-full [&>div]:h-full ${editing ? "pointer-events-none cursor-move" : ""}`}>{child}</div>
  );

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

      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: editing ? draftLayout : savedLayout }}
        breakpoints={{ lg: 996, md: 768, sm: 480, xs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
        rowHeight={50}
        margin={[12, 12]}
        isDraggable={editing}
        isResizable={editing}
        onLayoutChange={handleLayoutChange}
        onBreakpointChange={setBreakpoint}
      >
        <div key="statOrgs">
          {sectionBody(
            <StatCard
              title="Total Organizations"
              value={orgData.length}
              subtitle="Registered Organizations"
              icon={<Building2 size={20} />}
              color="purple"
              sparkData={sparkOrgs}
            />
          )}
        </div>
        <div key="statDevices">
          {sectionBody(
            <StatCard
              title="Total Devices"
              value={totalDevices}
              subtitle="All Registered Devices"
              icon={<Server size={20} />}
              color="blue"
              sparkData={sparkTotal}
            />
          )}
        </div>
        <div key="statStatus">
          {sectionBody(
            <StatCard
              title="Online / Offline"
              value={`${onlineDevices} / ${offlineDevices}`}
              subtitle={`${onlinePct}% online`}
              icon={<Activity size={20} />}
              color="green"
              sparkData={sparkStatus}
            />
          )}
        </div>
        <div key="statAlarms">
          {sectionBody(
            <StatCard
              title="Total Alarms"
              value={alarmSummary?.total ?? 0}
              subtitle={`${alarmSummary?.active ?? 0} active (${alarmSummary?.critical ?? 0} critical, ${alarmSummary?.warning ?? 0} warning)`}
              icon={<Bell size={20} />}
              color="amber"
            />
          )}
        </div>

        {/* Network Overview */}
        <div key="networkOverview">
          {sectionBody(
        <div className="h-full bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 transition-colors">
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
            {trafficData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                No traffic data yet — waiting for more telemetry
              </div>
            ) : (
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
            )}
          </div>
        </div>
          )}
        </div>

        {/* Device Health */}
        <div key="deviceHealth">
          {sectionBody(
        <div className="h-full bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 transition-colors">
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
          )}
        </div>

        {/* Recent Alarms */}
        <div key="recentAlarms">
          {sectionBody(
      <div className="h-full overflow-auto bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            Recent Alarms
          </h2>
          <button
            onClick={() => navigate("/alarms/active")}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
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
          )}
        </div>
      </ResponsiveGridLayout>

      {/* Floating Customize control — fixed to the top-right so it takes no space in the dashboard */}
      <div className="fixed top-20 right-6 z-40 flex items-center gap-2">
        {editing ? (
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full shadow-lg px-2 py-1.5">
            {layoutError && <p className="text-red-500 text-xs px-2">{layoutError}</p>}
            <button
              onClick={handleResetLayout}
              disabled={saving}
              title="Reset to default"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-slate-700 disabled:opacity-60"
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              onClick={cancelEditing}
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-full text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveLayout}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save size={14} /> {saving ? "Saving..." : "Save"}
            </button>
          </div>
        ) : (
          <button
            onClick={startEditing}
            title="Customize dashboard"
            aria-label="Customize dashboard"
            className="p-3 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <LayoutGrid size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
