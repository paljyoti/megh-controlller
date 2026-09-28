import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import ExportButton from "./ExportButton";
import type { ExportColumn } from "../utils/export";
import { canSendCommands } from "../services/api";
import { topologyApi, shortPort, type MacTableEntry, type MacTableResponse } from "../services/topologyApi";

// Learned MAC addresses per port, from the same "show mac-address-table" snapshot the
// Topology page uses (services/topology/topologyPoller.ts on the backend — read-only).

const MacAddressTableTab = ({ deviceId }: { deviceId?: string }) => {
  const [data, setData] = useState<MacTableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [portFilter, setPortFilter] = useState("All");

  const load = useCallback(async () => {
    if (!deviceId) return;
    try {
      const res = await topologyApi.getMacTable(deviceId);
      setData(res.data.data);
      setError("");
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || "Failed to load MAC table");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    if (!deviceId) return;
    setRefreshing(true);
    try {
      if (canSendCommands()) {
        const res = await topologyApi.refresh(deviceId);
        const r = res.data.data.results[0];
        if (r && !r.ok) setError(r.error || "Switch did not respond");
      }
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const ports = useMemo(() => Object.keys(data?.ports ?? {}).sort(), [data]);

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.entries ?? []).filter(
      (e) =>
        (portFilter === "All" || e.port === portFilter) &&
        (!q || e.mac.toLowerCase().includes(q) || e.port.toLowerCase().includes(q) || String(e.vlanId).includes(q)),
    );
  }, [data, search, portFilter]);

  const exportColumns: ExportColumn<MacTableEntry>[] = [
    { header: "VLAN", accessor: (e) => e.vlanId },
    { header: "MAC Address", accessor: (e) => e.mac },
    { header: "Type", accessor: (e) => e.type },
    { header: "Port", accessor: (e) => e.port },
    { header: "Learned At (switch)", accessor: (e) => e.learnedAt ?? "-" },
    { header: "Last Seen", accessor: (e) => new Date(e.lastSeen).toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {data ? `${data.total} addresses on ${ports.length} port${ports.length === 1 ? "" : "s"}` : " "}
          {data?.updatedAt && (
            <> · as of {new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>
          )}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search MAC / port / VLAN"
              className="pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={portFilter}
            onChange={(e) => setPortFilter(e.target.value)}
            className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          >
            <option>All</option>
            {ports.map((p) => (
              <option key={p} value={p}>
                {shortPort(p)} ({data?.ports[p]})
              </option>
            ))}
          </select>
          <button
            onClick={handleRefresh}
            disabled={refreshing || !deviceId}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60"
            title={canSendCommands() ? "Re-read the MAC table from the switch" : "Reload"}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Reading…" : "Refresh"}
          </button>
          <ExportButton filename="mac-address-table" title="MAC Address Table" columns={exportColumns} rows={rows} />
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
                <th className="px-4 py-3 font-medium">VLAN</th>
                <th className="px-4 py-3 font-medium">MAC Address</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Port</th>
                <th className="px-4 py-3 font-medium">Learned (switch time)</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{e.vlanId}</td>
                  <td className="px-4 py-3 font-mono text-gray-800 dark:text-gray-100">{e.mac}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{e.type}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-300">{shortPort(e.port)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{e.learnedAt ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(e.lastSeen).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    {data && data.total === 0
                      ? "No MAC addresses learned yet — the switch is polled every 5 minutes, or press Refresh."
                      : "No entries match"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default MacAddressTableTab;
