import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { api } from "../../services/api";

interface RouteRow {
  id: string;
  isDefaultRoute: boolean;
  destIpSegment: string;
  destIpMask: string;
  interfaceType: string;
  forwardingRoutingAddress: string | null;
  distanceMetric: number | null;
  routingTag: string | null;
  description: string | null;
}

const INTERFACE_TYPES = ["null0 interface", "specify next hop"];

const PAGE_SIZE = 50;

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return message || fallback;
};

const RouteConfigConfiguration = ({ deviceId }: { deviceId?: string }) => {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);
  const [failedDeletes, setFailedDeletes] = useState<string[]>([]);
  const [forcing, setForcing] = useState(false);

  const allSelected = routes.length > 0 && routes.every((r) => selected.has(r.id));
  const totalPages = Math.max(1, Math.ceil(routes.length / PAGE_SIZE));
  const pagedRoutes = routes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fetchRoutes = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.getRoutes(deviceId);
      setRoutes(res.data.data.routes);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load routes"));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchRoutes();
    setSelected(new Set());
    setPage(1);
  }, [fetchRoutes]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(routes.map((r) => r.id)));
  };

  const handleDeleteIds = async (ids: string[], force = false) => {
    if (!deviceId || ids.length === 0) return;
    setError("");
    if (!force) setFailedDeletes([]);
    const toDelete = routes.filter((r) => ids.includes(r.id));

    const results = await Promise.allSettled(
      toDelete.map((r) => api.deleteRoute(deviceId, r.id, force))
    );

    const failures = results
      .map((r, i) => ({ r, route: toDelete[i] }))
      .filter((x) => x.r.status === "rejected");

    if (failures.length > 0) {
      const first = failures[0].r as PromiseRejectedResult;
      setError(
        `Failed to ${force ? "remove" : "delete"} route ${failures[0].route.destIpSegment}: ${extractErrorMessage(
          first.reason,
          "Unknown error"
        )}`
      );
      if (!force) setFailedDeletes(failures.map((f) => f.route.id));
    } else if (force) {
      setFailedDeletes((cur) => cur.filter((id) => !ids.includes(id)));
    }

    setSelected(new Set());
    await fetchRoutes();
  };

  const handleDelete = () => handleDeleteIds(Array.from(selected));

  // For routes the switch rejects (usually because they already drifted off the device — see
  // routeConfigController.ts) — removes just the platform's record, no command sent to the device.
  const handleForceRemove = async () => {
    if (failedDeletes.length === 0) return;
    if (
      !confirm(
        `Remove ${failedDeletes.length} route(s) from this list only? This does not send any command to the device — only use this after confirming on the device itself that they no longer exist.`
      )
    )
      return;
    setForcing(true);
    try {
      await handleDeleteIds(failedDeletes, true);
    } finally {
      setForcing(false);
    }
  };

  return (
    <div>
      {!deviceId ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              + New
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              🗑 Delete
            </button>
          </div>

          {error && (
            <div className="mb-3 flex items-center gap-3">
              <p className="text-red-500 text-sm">{error}</p>
              {failedDeletes.length > 0 && (
                <button
                  onClick={handleForceRemove}
                  disabled={forcing}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50 whitespace-nowrap"
                >
                  {forcing ? "Removing..." : "Remove from list anyway"}
                </button>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">Loading routes...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-3 w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                    <th className="py-2 pr-3 font-medium">Dest IP Segment</th>
                    <th className="py-2 pr-3 font-medium">Dest IP Mask</th>
                    <th className="py-2 pr-3 font-medium">Forwarding Routing Address</th>
                    <th className="py-2 pr-3 font-medium">Distance Metric</th>
                    <th className="py-2 pr-3 font-medium">Operation</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRoutes.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 dark:border-slate-700/60">
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                        {r.destIpSegment}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                        {r.destIpMask}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                        {r.forwardingRoutingAddress || (r.interfaceType === "null0 interface" ? "null0" : "-")}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                        {r.distanceMetric ?? "-"}
                      </td>
                      <td className="py-2.5 pr-3">
                        <button
                          onClick={() => handleDeleteIds([r.id])}
                          className="text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {routes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-gray-400 dark:text-gray-500">
                        No Data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
                <span>Total {routes.length}</span>
                <div className="flex items-center gap-3">
                  <span>{PAGE_SIZE}/page</span>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-2 py-1 border border-gray-300 dark:border-slate-600 rounded disabled:opacity-40"
                  >
                    {"<"}
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-2 py-1 border border-gray-300 dark:border-slate-600 rounded disabled:opacity-40"
                  >
                    {">"}
                  </button>
                  <span className="flex items-center gap-1">
                    Go to
                    <input
                      type="number"
                      value={page}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) setPage(Math.min(totalPages, Math.max(1, v)));
                      }}
                      className="w-14 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                    />
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showAddModal && deviceId && (
        <AddRouteModal
          deviceId={deviceId}
          onClose={() => setShowAddModal(false)}
          onCreated={async () => {
            setShowAddModal(false);
            await fetchRoutes();
          }}
        />
      )}
    </div>
  );
};

function AddRouteModal({
  deviceId,
  onClose,
  onCreated,
}: {
  deviceId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [isDefaultRoute, setIsDefaultRoute] = useState(false);
  const [destIpSegment, setDestIpSegment] = useState("");
  const [destIpMask, setDestIpMask] = useState("");
  const [interfaceType, setInterfaceType] = useState(INTERFACE_TYPES[0]);
  const [forwardingRoutingAddress, setForwardingRoutingAddress] = useState("");
  const [distanceMetric, setDistanceMetric] = useState("");
  const [routingTag, setRoutingTag] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!isDefaultRoute && !destIpSegment.trim()) {
      setError("Dest IP Segment is required");
      return;
    }
    if (!isDefaultRoute && !destIpMask.trim()) {
      setError("Dest IP Mask is required");
      return;
    }
    if (interfaceType !== "null0 interface" && !forwardingRoutingAddress.trim()) {
      setError("Forwarding Routing Address is required for this interface type");
      return;
    }
    if (distanceMetric) {
      const d = parseInt(distanceMetric, 10);
      if (Number.isNaN(d) || d < 1 || d > 255) {
        setError("Distance Metric must be between 1 and 255");
        return;
      }
    }
    if (routingTag) {
      const t = parseInt(routingTag, 10);
      if (Number.isNaN(t) || t < 1 || t > 4294967295) {
        setError("Routing Tag must be between 1 and 4294967295");
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      await api.createRoute(deviceId, {
        isDefaultRoute,
        destIpSegment: isDefaultRoute ? "0.0.0.0" : destIpSegment.trim(),
        destIpMask: isDefaultRoute ? "0.0.0.0" : destIpMask.trim(),
        interfaceType,
        forwardingRoutingAddress: forwardingRoutingAddress.trim() || undefined,
        distanceMetric: distanceMetric ? parseInt(distanceMetric, 10) : undefined,
        routingTag: routingTag ? parseInt(routingTag, 10) : undefined,
        description: description.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create route"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-md max-h-[90vh] overflow-y-auto p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Route Config</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={isDefaultRoute}
              onChange={(e) => setIsDefaultRoute(e.target.checked)}
            />
            Default Route
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              <span className="text-red-500">*</span> Dest IP Segment
            </label>
            <input
              type="text"
              value={isDefaultRoute ? "0.0.0.0" : destIpSegment}
              disabled={isDefaultRoute}
              onChange={(e) => setDestIpSegment(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              <span className="text-red-500">*</span> Dest IP Mask
            </label>
            <input
              type="text"
              value={isDefaultRoute ? "0.0.0.0" : destIpMask}
              disabled={isDefaultRoute}
              onChange={(e) => setDestIpMask(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Interface Type
            </label>
            <select
              value={interfaceType}
              onChange={(e) => setInterfaceType(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              {INTERFACE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Forwarding Routing Address
            </label>
            <input
              type="text"
              value={forwardingRoutingAddress}
              disabled={interfaceType === "null0 interface"}
              onChange={(e) => setForwardingRoutingAddress(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Distance Metric
            </label>
            <input
              type="number"
              placeholder="1~255"
              value={distanceMetric}
              onChange={(e) => setDistanceMetric(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Routing Tag
            </label>
            <input
              type="number"
              placeholder="1~4294967295"
              value={routingTag}
              onChange={(e) => setRoutingTag(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Specify The Route Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RouteConfigConfiguration;
