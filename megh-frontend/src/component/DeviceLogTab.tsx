import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import ExportButton from "./ExportButton";
import type { ExportColumn } from "../utils/export";

type LogSubTabKey = "events" | "commands";

const LOG_SUB_TABS: { key: LogSubTabKey; label: string }[] = [
  { key: "events", label: "Events" },
  { key: "commands", label: "Command History" },
];

interface DeviceEventRow {
  id: string;
  event: string;
  port: string | null;
  timestamp: string;
  createdAt: string;
}

interface CommandLogRow {
  id: string;
  requestId: string;
  command: string;
  responseStatus: number | null;
  responseMessage: string | null;
  fileType: string | null;
  createdAt: string;
}

const RESPONSE_STATUS_LABELS: Record<number, string> = {
  0: "Success",
  1: "Invalid command",
  2: "Invalid params",
  3: "Exec failed",
  4: "Busy",
  5: "Internal error",
};

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return message || fallback;
};

function StatusBadge({ status }: { status: number | null }) {
  if (status === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Pending
      </span>
    );
  }
  const isSuccess = status === 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
        isSuccess ? "text-green-600 dark:text-green-400" : "text-red-500"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? "bg-green-500" : "bg-red-500"}`} />
      {RESPONSE_STATUS_LABELS[status] ?? `Status ${status}`}
    </span>
  );
}

// Export config is handed up from whichever child table is currently mounted, so the button
// can live in the shared sub-tab row instead of each child reserving its own row for it.
interface LogExportConfig {
  filename: string;
  title: string;
  columns: ExportColumn<any>[];
  rows: any[];
}

const DeviceLogTab = ({ deviceId }: { deviceId?: string }) => {
  const [subTab, setSubTab] = useState<LogSubTabKey>("events");
  const [exportConfig, setExportConfig] = useState<LogExportConfig | null>(null);

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-700 mb-4">
        <div className="flex items-center gap-6">
          {LOG_SUB_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`pb-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                subTab === tab.key
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {exportConfig && (
          <div className="pb-2.5">
            <ExportButton
              filename={exportConfig.filename}
              title={exportConfig.title}
              columns={exportConfig.columns}
              rows={exportConfig.rows}
            />
          </div>
        )}
      </div>

      {!deviceId ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
        </div>
      ) : subTab === "events" ? (
        <EventsTable deviceId={deviceId} onExportReady={setExportConfig} />
      ) : (
        <CommandHistoryTable deviceId={deviceId} onExportReady={setExportConfig} />
      )}
    </div>
  );
};

function EventsTable({
  deviceId,
  onExportReady,
}: {
  deviceId: string;
  onExportReady: (config: LogExportConfig | null) => void;
}) {
  const [events, setEvents] = useState<DeviceEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getDeviceEvents(deviceId, 100);
      setEvents(res.data.data.events);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load events"));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    onExportReady({
      filename: "device-events",
      title: "Device Events Report",
      columns: [
        { header: "Time", accessor: (e: DeviceEventRow) => new Date(e.createdAt).toLocaleString() },
        { header: "Event", accessor: (e: DeviceEventRow) => e.event },
        { header: "Port", accessor: (e: DeviceEventRow) => e.port || "-" },
      ],
      rows: events,
    });
    return () => onExportReady(null);
  }, [events, onExportReady]);

  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (loading) return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading events...</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">Event</th>
            <th className="py-2 pr-3 font-medium">Port</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-gray-100 dark:border-slate-700/60">
              <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">
                {new Date(e.createdAt).toLocaleString()}
              </td>
              <td className="py-2.5 pr-3">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    e.event === "port_up"
                      ? "text-green-600 dark:text-green-400"
                      : e.event === "port_down"
                      ? "text-red-500"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {e.event}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{e.port || "-"}</td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-center text-gray-400 dark:text-gray-500">
                No events recorded
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CommandHistoryTable({
  deviceId,
  onExportReady,
}: {
  deviceId: string;
  onExportReady: (config: LogExportConfig | null) => void;
}) {
  const [logs, setLogs] = useState<CommandLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getCommandLogs(deviceId, 100);
      setLogs(res.data.data.commandLogs);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load command history"));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    onExportReady({
      filename: "command-history",
      title: "Command History Report",
      columns: [
        { header: "Time", accessor: (l: CommandLogRow) => new Date(l.createdAt).toLocaleString() },
        {
          header: "Command",
          accessor: (l: CommandLogRow) => (l.fileType ? `file_transfer (${l.fileType})` : l.command),
        },
        {
          header: "Status",
          accessor: (l: CommandLogRow) =>
            l.responseStatus === null
              ? "Pending"
              : RESPONSE_STATUS_LABELS[l.responseStatus] ?? `Status ${l.responseStatus}`,
        },
        { header: "Response", accessor: (l: CommandLogRow) => l.responseMessage || "-" },
      ],
      rows: logs,
    });
    return () => onExportReady(null);
  }, [logs, onExportReady]);

  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (loading) return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading command history...</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">Command</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Response</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-gray-100 dark:border-slate-700/60 align-top">
              <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {new Date(l.createdAt).toLocaleString()}
              </td>
              <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100 font-mono text-xs whitespace-pre-wrap max-w-xs">
                {l.fileType ? `file_transfer (${l.fileType})` : l.command}
              </td>
              <td className="py-2.5 pr-3">
                <StatusBadge status={l.responseStatus} />
              </td>
              <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 text-xs max-w-xs">
                {l.responseMessage || "-"}
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-400 dark:text-gray-500">
                No commands recorded
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DeviceLogTab;
