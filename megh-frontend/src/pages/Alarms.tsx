import { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import { api } from "../services/api";
import ExportButton from "../component/ExportButton";
import type { ExportColumn } from "../utils/export";

interface Alarm {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  status: string;
  triggeredAt: string;
  device: { id: string; name: string; serialNumber: string };
}

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const PAGE_SIZE = 20;

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
};

const Alarms = () => {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAlarms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getAllAlarms({
        limit: PAGE_SIZE,
        page,
        ...(statusFilter !== "All" ? { status: statusFilter.toLowerCase() } : {}),
        ...(severityFilter !== "All" ? { severity: severityFilter.toLowerCase() } : {}),
      });
      setAlarms(res.data.data.alarms);
      setTotal(res.data.data.total ?? res.data.data.alarms.length);
      setTotalPages(res.data.data.totalPages ?? 1);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load alarms"));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, severityFilter]);

  useEffect(() => {
    fetchAlarms();
  }, [fetchAlarms]);

  const exportColumns: ExportColumn<Alarm>[] = [
    { header: "Message", accessor: (a) => a.message },
    { header: "Device", accessor: (a) => a.device?.name || "-" },
    { header: "Type", accessor: (a) => a.type },
    { header: "Severity", accessor: (a) => a.severity },
    { header: "Status", accessor: (a) => a.status },
    { header: "Triggered", accessor: (a) => new Date(a.triggeredAt).toLocaleString() },
  ];

  // The list itself is server-paginated (only the current page is in `alarms`), so export
  // fetches every row matching the active filters in one go rather than just what's on screen.
  const fetchAllForExport = async (): Promise<Alarm[]> => {
    const res = await api.getAllAlarms({
      limit: Math.max(total, 1),
      ...(statusFilter !== "All" ? { status: statusFilter.toLowerCase() } : {}),
      ...(severityFilter !== "All" ? { severity: severityFilter.toLowerCase() } : {}),
    });
    return res.data.data.alarms;
  };

  return (
    <div className="p-6 min-h-screen space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <Bell size={22} /> Alarms
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{total} total</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          >
            <option>All</option>
            <option>Active</option>
            <option>Acknowledged</option>
            <option>Resolved</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          >
            <option>All</option>
            <option>Critical</option>
            <option>Warning</option>
            <option>Info</option>
          </select>
          <ExportButton
            filename="alarm-report"
            title="Alarm Report"
            columns={exportColumns}
            fetchRows={fetchAllForExport}
          />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-x-auto">
        {loading ? (
          <p className="text-center py-10 text-gray-400 dark:text-gray-500">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Triggered</th>
              </tr>
            </thead>
            <tbody>
              {alarms.map((alarm) => (
                <tr
                  key={alarm.id}
                  className="border-b border-gray-100 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                >
                  <td className="px-4 py-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${severityDot[alarm.severity]}`} />
                  </td>
                  <td className="px-4 py-3 text-gray-800 dark:text-gray-100">{alarm.message}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{alarm.device?.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{alarm.type}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{alarm.status}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(alarm.triggeredAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                </tr>
              ))}
              {alarms.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    No alarms found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 rounded-md border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 disabled:opacity-40"
          >
            {"<"}
          </button>
          {[...Array(totalPages)].map((_, index) => (
            <button
              key={index}
              onClick={() => setPage(index + 1)}
              className={`px-3 py-1 rounded-md border ${
                page === index + 1
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              }`}
            >
              {index + 1}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded-md border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 disabled:opacity-40"
          >
            {">"}
          </button>
        </div>
      )}
    </div>
  );
};

export default Alarms;
