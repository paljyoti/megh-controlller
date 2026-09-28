import { useEffect, useState, useCallback } from "react";
import { RefreshCw, X, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../services/api";

type LinkAggSubTabKey = "portChannel" | "loadBalance" | "lacp";

const LINK_AGG_SUB_TABS: { key: LinkAggSubTabKey; label: string }[] = [
  { key: "portChannel", label: "Port Channel Configuration" },
  { key: "loadBalance", label: "Load Balancing Based on Aggregation Group Configuration" },
  { key: "lacp", label: "LACP Settings" },
];

type LinkAggMode = "static" | "active" | "passive";

const MODE_LABELS: Record<LinkAggMode, string> = {
  static: "Static",
  active: "LACP Active",
  passive: "LACP Passive",
};

type FieldResult = { applied: boolean; message?: string };

interface LinkAggRow {
  id: string;
  groupId: number;
  mode: LinkAggMode;
  memberPorts: string[];
  validMemberPorts: string[];
  state: "up" | "down";
  deviceConfirmed: boolean;
}

interface PortOption {
  name: string;
}

const extractResults = (err: unknown): Record<string, FieldResult> | null => {
  const body = (err as { response?: { data?: { data?: { results?: Record<string, FieldResult> } } } })
    ?.response?.data?.data;
  return body?.results ?? null;
};

const PAGE_SIZE = 10;

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return message || fallback;
};

const LinkAggregationConfiguration = ({ deviceId }: { deviceId?: string }) => {
  const [subTab, setSubTab] = useState<LinkAggSubTabKey>("portChannel");

  return (
    <div>
      <div className="flex items-center gap-6 border-b border-gray-200 dark:border-slate-700 mb-4 overflow-x-auto">
        {LINK_AGG_SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`whitespace-nowrap px-1 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              subTab === tab.key
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === "portChannel" ? (
        <PortChannelConfig deviceId={deviceId} />
      ) : subTab === "loadBalance" ? (
        <LoadBalanceConfig deviceId={deviceId} />
      ) : (
        <LacpSettingsConfig deviceId={deviceId} />
      )}
    </div>
  );
};

function PortChannelConfig({ deviceId }: { deviceId?: string }) {
  const [groups, setGroups] = useState<LinkAggRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);

  const allSelected = groups.length > 0 && groups.every((g) => selected.has(g.id));
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const pagedGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fetchGroups = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.getLinkAggregations(deviceId);
      setGroups(res.data.data.linkAggregations);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load aggregation groups"));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchGroups();
    setSelected(new Set());
    setPage(1);
  }, [fetchGroups]);

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
    else setSelected(new Set(groups.map((g) => g.id)));
  };

  const handleDelete = async (ids?: Set<string>) => {
    if (!deviceId) return;
    const targetIds = ids ?? selected;
    if (targetIds.size === 0) return;
    setError("");
    const toDelete = groups.filter((g) => targetIds.has(g.id));

    const results = await Promise.allSettled(
      toDelete.map((g) => api.deleteLinkAggregation(deviceId, g.id))
    );

    const failures = results
      .map((r, i) => ({ r, group: toDelete[i] }))
      .filter((x) => x.r.status === "rejected");

    if (failures.length > 0) {
      const first = failures[0].r as PromiseRejectedResult;
      const portResults = extractResults(first.reason);
      const rejectedPort = portResults && Object.entries(portResults).find(([, v]) => !v.applied);
      setError(
        rejectedPort
          ? `Group ${failures[0].group.groupId}: switch rejected removing ${rejectedPort[0]} (${rejectedPort[1].message || "rejected"}) — group not deleted`
          : `Failed to delete group ${failures[0].group.groupId}: ${extractErrorMessage(first.reason, "Unknown error")}`
      );
    }

    setSelected(new Set());
    await fetchGroups();
  };

  return (
    <div>
      {!deviceId ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                + Add
              </button>
              <button
                onClick={() => handleDelete()}
                disabled={selected.size === 0}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                🗑 Delete
              </button>
            </div>
            <button
              onClick={fetchGroups}
              title="Refresh"
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          {loading ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">Loading aggregation groups...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-3 w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                    <th className="py-2 pr-3 font-medium">Aggregation Group</th>
                    <th className="py-2 pr-3 font-medium">Mode</th>
                    <th className="py-2 pr-3 font-medium">Configure Member Ports</th>
                    <th className="py-2 pr-3 font-medium">Valid Member Ports</th>
                    <th className="py-2 pr-3 font-medium">State</th>
                    <th className="py-2 pr-3 font-medium">Operation</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGroups.map((g) => (
                    <tr key={g.id} className="border-b border-gray-100 dark:border-slate-700/60">
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          checked={selected.has(g.id)}
                          onChange={() => toggleSelect(g.id)}
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">po{g.groupId}</td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                        {MODE_LABELS[g.mode]}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                        {g.memberPorts.join(", ")}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                        {g.validMemberPorts.join(", ") || "-"}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            g.state === "up"
                              ? "text-green-600 dark:text-green-400"
                              : "text-gray-400 dark:text-gray-500"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              g.state === "up" ? "bg-green-500" : "bg-gray-400 dark:bg-slate-500"
                            }`}
                          />
                          {g.state}
                        </span>
                        {!g.deviceConfirmed && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                            not fully confirmed on device
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <button
                          onClick={() => handleDelete(new Set([g.id]))}
                          className="text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {groups.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-gray-400 dark:text-gray-500">
                        No Data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
                <span>Total {groups.length}</span>
                <div className="flex items-center gap-3">
                  <span>{PAGE_SIZE}/page</span>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-2 py-1 border border-gray-300 dark:border-slate-600 rounded disabled:opacity-40"
                  >
                    {"<"}
                  </button>
                  <span className="px-2 py-1 text-blue-600 dark:text-blue-400 font-medium">{page}</span>
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
        <AddLinkAggModal
          deviceId={deviceId}
          usedGroupIds={new Set(groups.map((g) => g.groupId))}
          usedPorts={new Set(groups.flatMap((g) => g.memberPorts))}
          onClose={() => setShowAddModal(false)}
          onCreated={async (partialFailureMessage) => {
            setShowAddModal(false);
            if (partialFailureMessage) setError(partialFailureMessage);
            await fetchGroups();
          }}
        />
      )}
    </div>
  );
}

function AddLinkAggModal({
  deviceId,
  usedGroupIds,
  usedPorts,
  onClose,
  onCreated,
}: {
  deviceId: string;
  usedGroupIds: Set<number>;
  usedPorts: Set<string>;
  onClose: () => void;
  onCreated: (partialFailureMessage?: string) => void;
}) {
  const [allPorts, setAllPorts] = useState<PortOption[]>([]);
  const [groupId, setGroupId] = useState("");
  const [mode, setMode] = useState<LinkAggMode>("static");
  const [configuredMembers, setConfiguredMembers] = useState<string[]>([]);
  const [checkedAvailable, setCheckedAvailable] = useState<Set<string>>(new Set());
  const [checkedConfigured, setCheckedConfigured] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getPorts(deviceId)
      .then((res) => setAllPorts(res.data.data.ports))
      .catch(() => {
        // Port dropdown is a convenience; failing to load it shouldn't block the modal.
      });
  }, [deviceId]);

  const availablePorts = allPorts
    .map((p) => p.name)
    .filter((name) => !usedPorts.has(name) && !configuredMembers.includes(name));

  const groupOptions = Array.from({ length: 12 }, (_, i) => i + 1).filter(
    (id) => !usedGroupIds.has(id)
  );

  const moveToConfigured = () => {
    setConfiguredMembers((prev) => [...prev, ...Array.from(checkedAvailable)]);
    setCheckedAvailable(new Set());
  };

  const moveToAvailable = () => {
    setConfiguredMembers((prev) => prev.filter((p) => !checkedConfigured.has(p)));
    setCheckedConfigured(new Set());
  };

  const toggleChecked = (set: Set<string>, setSet: (s: Set<string>) => void, name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSet(next);
  };

  const handleSave = async () => {
    const gid = parseInt(groupId, 10);
    if (!groupId || Number.isNaN(gid)) {
      setError("Aggregation Group is required");
      return;
    }
    if (configuredMembers.length === 0) {
      setError("At least one member port is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.createLinkAggregation(deviceId, { groupId: gid, mode, memberPorts: configuredMembers });
      onCreated();
    } catch (err) {
      const results = extractResults(err);
      if (results) {
        const failed = Object.entries(results).filter(([, r]) => !r.applied);
        const succeeded = Object.entries(results).filter(([, r]) => r.applied);
        const message =
          failed.length === configuredMembers.length
            ? `Switch rejected every port for group po${gid}: ${failed.map(([p, r]) => `${p} (${r.message || "rejected"})`).join(", ")}`
            : `Group po${gid} created with ${succeeded.length}/${configuredMembers.length} ports — rejected: ${failed.map(([p, r]) => `${p} (${r.message || "rejected"})`).join(", ")}`;
        // Any confirmed subset was still persisted server-side — close and hand the message up
        // so the list (which will show the real state) and the error banner both stay in sync.
        onCreated(message);
      } else {
        setError(extractErrorMessage(err, "Failed to create aggregation group"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-5">
          <div className="grid grid-cols-[150px_1fr] gap-x-4 items-center">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Aggregation Group
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-40 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Select</option>
              {groupOptions.map((id) => (
                <option key={id} value={id}>
                  po{id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-[150px_1fr] gap-x-4 items-start">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300 pt-2">
              Configure Member Ports
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-600">
                  Available Port List {checkedAvailable.size}/{availablePorts.length}
                </div>
                <div className="h-40 overflow-y-auto p-2 space-y-1">
                  {availablePorts.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">No data</p>
                  ) : (
                    availablePorts.map((name) => (
                      <label
                        key={name}
                        className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checkedAvailable.has(name)}
                          onChange={() => toggleChecked(checkedAvailable, setCheckedAvailable, name)}
                        />
                        {name}
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                <button
                  type="button"
                  onClick={moveToAvailable}
                  disabled={checkedConfigured.size === 0}
                  className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                  title="Remove from group"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={moveToConfigured}
                  disabled={checkedAvailable.size === 0}
                  className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                  title="Add to group"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-700/50 border-b border-gray-200 dark:border-slate-600">
                  Configured Member Ports {checkedConfigured.size}/{configuredMembers.length}
                </div>
                <div className="h-40 overflow-y-auto p-2 space-y-1">
                  {configuredMembers.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">No data</p>
                  ) : (
                    configuredMembers.map((name) => (
                      <label
                        key={name}
                        className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 px-1 py-1 rounded hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checkedConfigured.has(name)}
                          onChange={() => toggleChecked(checkedConfigured, setCheckedConfigured, name)}
                        />
                        {name}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[150px_1fr] gap-x-4 items-center">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
              <span className="text-red-500">*</span> Mode
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as LinkAggMode)}
              className="w-48 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              {(Object.keys(MODE_LABELS) as LinkAggMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
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
            {saving ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

const LOAD_BALANCE_METHOD_LABELS: Record<string, string> = {
  "dst-ip": "Destination IP address",
  "dst-mac": "Destination MAC address",
  "dst-port": "Destination L4 port",
  "src-dst-ip": "Source and destination IP address",
  "src-dst-mac": "Source and destination MAC address",
  "src-dst-port": "Source and destination L4 port",
  "src-ip": "Source IP address",
  "src-mac": "Source MAC address",
  "src-port": "Source L4 port",
};

function LoadBalanceConfig({ deviceId }: { deviceId?: string }) {
  const [method, setMethod] = useState("src-mac");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchMethod = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.getLoadBalanceMethod(deviceId);
      setMethod(res.data.data.method);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load balance method"));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchMethod();
  }, [fetchMethod]);

  const handleSave = async () => {
    if (!deviceId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.updateLoadBalanceMethod(deviceId, method);
      setSuccess("Load balance method updated");
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update load balance method"));
    } finally {
      setSaving(false);
    }
  };

  if (!deviceId) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      {success && <p className="text-green-600 dark:text-green-400 text-sm mb-3">{success}</p>}

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="grid grid-cols-[150px_1fr] gap-x-4 items-center">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Load Balance Method
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          >
            {Object.entries(LOAD_BALANCE_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label} ({value})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

interface LacpPortRow {
  name: string;
  lacpPortPriority: number;
  lacpTimeout: "long" | "short";
  deviceConfirmed: boolean;
}

function LacpSettingsConfig({ deviceId }: { deviceId?: string }) {
  const [systemPriority, setSystemPriority] = useState("32768");
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [priorityError, setPriorityError] = useState("");
  const [prioritySuccess, setPrioritySuccess] = useState("");

  const [ports, setPorts] = useState<LacpPortRow[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [portsError, setPortsError] = useState("");
  const [editingPort, setEditingPort] = useState<LacpPortRow | null>(null);

  const fetchPriority = useCallback(async () => {
    if (!deviceId) return;
    setPriorityLoading(true);
    setPriorityError("");
    try {
      const res = await api.getLacpSystemPriority(deviceId);
      setSystemPriority(String(res.data.data.priority));
    } catch (err) {
      setPriorityError(extractErrorMessage(err, "Failed to load LACP system priority"));
    } finally {
      setPriorityLoading(false);
    }
  }, [deviceId]);

  const fetchPorts = useCallback(async () => {
    if (!deviceId) return;
    setPortsLoading(true);
    setPortsError("");
    try {
      const res = await api.getPorts(deviceId);
      setPorts(res.data.data.ports);
    } catch (err) {
      setPortsError(extractErrorMessage(err, "Failed to load ports"));
    } finally {
      setPortsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchPriority();
    fetchPorts();
  }, [fetchPriority, fetchPorts]);

  const handleSavePriority = async () => {
    if (!deviceId) return;
    const parsed = parseInt(systemPriority, 10);
    if (!systemPriority || Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
      setPriorityError("Enter a valid priority (1-65535)");
      return;
    }
    setPrioritySaving(true);
    setPriorityError("");
    setPrioritySuccess("");
    try {
      await api.updateLacpSystemPriority(deviceId, parsed);
      setPrioritySuccess("LACP system priority updated — this affects every aggregation group on the device");
    } catch (err) {
      setPriorityError(extractErrorMessage(err, "Failed to update LACP system priority"));
    } finally {
      setPrioritySaving(false);
    }
  };

  if (!deviceId) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-lg mb-8">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">System Priority</h3>
        {priorityError && <p className="text-red-500 text-sm mb-3">{priorityError}</p>}
        {prioritySuccess && <p className="text-green-600 dark:text-green-400 text-sm mb-3">{prioritySuccess}</p>}
        {priorityLoading ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
        ) : (
          <div className="grid grid-cols-[150px_1fr] gap-x-4 items-center">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">LACP System Priority</label>
            <input
              type="number"
              value={systemPriority}
              onChange={(e) => setSystemPriority(e.target.value)}
              className="w-40 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button
            onClick={handleSavePriority}
            disabled={prioritySaving || priorityLoading}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {prioritySaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Per-Port LACP Settings</h3>
      {portsError && <p className="text-red-500 text-sm mb-3">{portsError}</p>}
      {portsLoading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading ports...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-3 font-medium">Port</th>
                <th className="py-2 pr-3 font-medium">Port Priority</th>
                <th className="py-2 pr-3 font-medium">Timeout</th>
                <th className="py-2 pr-3 font-medium">Operation</th>
              </tr>
            </thead>
            <tbody>
              {ports.map((p) => (
                <tr key={p.name} className="border-b border-gray-100 dark:border-slate-700/60">
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{p.name}</td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{p.lacpPortPriority}</td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100 capitalize">{p.lacpTimeout}</td>
                  <td className="py-2.5 pr-3">
                    <button
                      onClick={() => setEditingPort(p)}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {ports.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400 dark:text-gray-500">
                    No ports reported by this device yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingPort && (
        <EditLacpPortModal
          deviceId={deviceId}
          port={editingPort}
          onClose={() => setEditingPort(null)}
          onSaved={() => {
            setEditingPort(null);
            fetchPorts();
          }}
        />
      )}
    </div>
  );
}

function EditLacpPortModal({
  deviceId,
  port,
  onClose,
  onSaved,
}: {
  deviceId: string;
  port: LacpPortRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [priority, setPriority] = useState(String(port.lacpPortPriority));
  const [timeout_, setTimeout_] = useState<"long" | "short">(port.lacpTimeout);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const parsed = parseInt(priority, 10);
    if (!priority || Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
      setError("Enter a valid priority (1-65535)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.updatePort(deviceId, port.name, { lacpPortPriority: parsed, lacpTimeout: timeout_ });
      const results = (res.data.data.results ?? {}) as Record<string, FieldResult>;
      const failed = Object.entries(results).find(([, r]) => !r.applied);
      if (failed) {
        setError(`${failed[0]}: ${failed[1].message || "rejected by device"}`);
      } else {
        onSaved();
      }
    } catch (err) {
      const results = extractResults(err);
      const failed = results && Object.entries(results).find(([, r]) => !r.applied);
      setError(
        failed
          ? `${failed[0]}: ${failed[1].message || "rejected by device"}`
          : extractErrorMessage(err, "Failed to update port")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-sm p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">LACP — {port.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Port Priority</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Timeout</label>
          <select
            value={timeout_}
            onChange={(e) => setTimeout_(e.target.value as "long" | "short")}
            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          >
            <option value="long">Long (30s interval / 90s timeout)</option>
            <option value="short">Short (1s interval / 3s timeout)</option>
          </select>
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

export default LinkAggregationConfiguration;
