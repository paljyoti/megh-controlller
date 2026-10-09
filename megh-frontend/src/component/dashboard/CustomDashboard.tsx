import { useEffect, useState } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { X, Plus, Pencil, RotateCcw, Save } from "lucide-react";
import { api } from "../../services/api";
import {
  WIDGET_CATALOG,
  catalogLabel,
  WidgetRenderer,
  type WidgetInstance,
  type WidgetType,
  type SharedDashboardData,
} from "./widgetCatalog";

const ResponsiveGridLayout = WidthProvider(Responsive);

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
};

let nextId = 0;
const newWidgetId = () => `w${Date.now()}_${nextId++}`;

const CustomDashboard = ({
  initialWidgets,
  startInEditMode = false,
  onSaved,
  onReset,
  onCancelCreate,
}: {
  initialWidgets: WidgetInstance[];
  startInEditMode?: boolean;
  onSaved: (widgets: WidgetInstance[]) => void;
  onReset: () => void;
  onCancelCreate?: () => void;
}) => {
  const [widgets, setWidgets] = useState<WidgetInstance[]>(initialWidgets);
  const [editing, setEditing] = useState(startInEditMode);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const [sharedData, setSharedData] = useState<SharedDashboardData>({
    devices: [],
    alarms: [],
    alarmSummary: null,
    trafficData: [],
  });
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAllDevices().then((res) => res.data.data.devices),
      api.getAllAlarms({ limit: 10 }).then((res) => res.data.data.alarms),
      api.getAlarmSummary().then((res) => res.data.data),
      api.getNetworkOverview().then((res) => res.data.data.overview),
    ])
      .then(([devices, alarms, alarmSummary, trafficData]) => {
        setSharedData({ devices, alarms, alarmSummary, trafficData });
      })
      .catch((err) => console.error("Custom dashboard data fetch failed:", err))
      .finally(() => setLoadingData(false));
  }, []);

  const layout: Layout[] = widgets.map((w) => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    minW: 2,
    minH: 2,
  }));

  const handleLayoutChange = (newLayout: Layout[]) => {
    if (!editing) return;
    setWidgets((cur) =>
      cur.map((w) => {
        const match = newLayout.find((l) => l.i === w.id);
        if (!match) return w;
        return { ...w, layout: { x: match.x, y: match.y, w: match.w, h: match.h } };
      })
    );
  };

  const addWidget = (type: WidgetType) => {
    const entry = WIDGET_CATALOG.find((c) => c.type === type)!;
    const maxY = widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
    setWidgets((cur) => [
      ...cur,
      {
        id: newWidgetId(),
        type,
        layout: { x: 0, y: maxY, w: entry.defaultSize.w, h: entry.defaultSize.h },
      },
    ]);
    setShowAddPanel(false);
  };

  const removeWidget = (id: string) => setWidgets((cur) => cur.filter((w) => w.id !== id));

  const setWidgetDevice = (id: string, deviceId: string) =>
    setWidgets((cur) => cur.map((w) => (w.id === id ? { ...w, deviceId } : w)));

  const handleSave = async () => {
    if (widgets.length === 0) {
      setError("Add at least one widget before saving");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.saveDashboardLayout(widgets);
      setEditing(false);
      onSaved(widgets);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to save dashboard"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Remove your custom dashboard and go back to the Standard Dashboard?")) return;
    setResetting(true);
    setError("");
    try {
      await api.resetDashboardLayout();
      onReset();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to reset dashboard"));
    } finally {
      setResetting(false);
    }
  };

  const handleCancelEdit = () => {
    if (initialWidgets.length === 0 && onCancelCreate) {
      onCancelCreate();
      return;
    }
    setWidgets(initialWidgets);
    setEditing(false);
    setError("");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {editing ? "Customize Dashboard" : "My Dashboard"}
        </h1>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setShowAddPanel((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <Plus size={15} /> Add Widget
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                <Save size={15} /> {saving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <Pencil size={15} /> Edit Dashboard
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-slate-700 disabled:opacity-60"
              >
                <RotateCcw size={15} /> {resetting ? "Resetting..." : "Reset to Standard"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {showAddPanel && editing && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap gap-2">
          {WIDGET_CATALOG.map((c) => (
            <button
              key={c.type}
              onClick={() => addWidget(c.type)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              + {c.label}
            </button>
          ))}
        </div>
      )}

      {widgets.length === 0 ? (
        <div className="flex items-center justify-center h-40 bg-white dark:bg-slate-800 border border-dashed border-gray-300 dark:border-slate-600 rounded-xl">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No widgets yet — click "Add Widget" to start building your dashboard.
          </p>
        </div>
      ) : loadingData ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : (
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: layout }}
          breakpoints={{ lg: 996, md: 768, sm: 480, xs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
          rowHeight={50}
          margin={[12, 12]}
          isDraggable={editing}
          isResizable={editing}
          draggableCancel=".no-drag"
          onLayoutChange={handleLayoutChange}
        >
          {widgets.map((w) => (
            <div
              key={w.id}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden relative"
            >
              {editing && (
                <div className="no-drag absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
                  {WIDGET_CATALOG.find((c) => c.type === w.type)?.needsDevice && (
                    <select
                      value={w.deviceId ?? ""}
                      onChange={(e) => setWidgetDevice(w.id, e.target.value)}
                      className="text-[11px] border border-gray-300 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200"
                    >
                      <option value="">Select device</option>
                      {sharedData.devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name || d.id}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => removeWidget(w.id)}
                    title={`Remove ${catalogLabel(w.type)}`}
                    className="p-1 rounded bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 text-gray-500 hover:text-red-500"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <div className="h-full">
                <WidgetRenderer widget={w} data={sharedData} />
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
};

export default CustomDashboard;
