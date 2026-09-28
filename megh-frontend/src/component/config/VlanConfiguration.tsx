import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, X, Pencil } from "lucide-react";
import { api } from "../../services/api";

type VlanSubTabKey = "list" | "physicalPort" | "aggregatePort";

const VLAN_SUB_TABS: { key: VlanSubTabKey; label: string }[] = [
  { key: "list", label: "VLAN List" },
  { key: "physicalPort", label: "Physical Port List" },
  // { key: "aggregatePort", label: "Aggregate Port List" },
];

interface VlanRow {
  id: string;
  vlanId: number;
  name: string;
}

type PortType = "access" | "trunk" | "hybrid";

interface PortRow {
  name: string;
  status: string;
  description: string | null;
  portType: PortType;
  vlanId: number;
  trunkAllowedVlan: string;
  hybridAllowedVlan: string;
  hybridUntaggedVlan: string;
  deviceConfirmed: boolean;
}

type FieldResult = { applied: boolean; message?: string };

const extractPortUpdateResult = (
  err: unknown
): { ports?: PortRow[]; results?: Record<string, FieldResult> } | null => {
  const body = (err as { response?: { data?: { data?: { ports?: PortRow[]; results?: Record<string, FieldResult> } } } })
    ?.response?.data?.data;
  return body ?? null;
};

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return message || fallback;
};

const VlanConfiguration = ({ deviceId }: { deviceId?: string }) => {
  const [subTab, setSubTab] = useState<VlanSubTabKey>("list");

  // VLAN List state
  const [vlans, setVlans] = useState<VlanRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVlan, setEditingVlan] = useState<VlanRow | null>(null);
  const [failedDeletes, setFailedDeletes] = useState<number[]>([]);
  const [forcing, setForcing] = useState(false);

  // Physical Port List state
  const [ports, setPorts] = useState<PortRow[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [portsError, setPortsError] = useState("");
  const [selectedPorts, setSelectedPorts] = useState<Set<string>>(new Set());
  const [editingPort, setEditingPort] = useState<PortRow | null>(null);

  const selectableVlans = vlans.filter((v) => v.vlanId !== 1);
  const allSelected =
    selectableVlans.length > 0 && selectableVlans.every((v) => selected.has(v.id));

  const fetchVlans = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.getVlans(deviceId);
      setVlans(res.data.data.vlans);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load VLANs"));
    } finally {
      setLoading(false);
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
    fetchVlans();
    setSelected(new Set());
  }, [fetchVlans]);

  useEffect(() => {
    if (subTab === "physicalPort") {
      fetchPorts();
      setSelectedPorts(new Set());
    }
  }, [subTab, fetchPorts]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableVlans.map((v) => v.id)));
    }
  };

  const toggleSelectPort = (name: string) => {
    setSelectedPorts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAllPorts = () => {
    if (ports.length > 0 && ports.every((p) => selectedPorts.has(p.name))) {
      setSelectedPorts(new Set());
    } else {
      setSelectedPorts(new Set(ports.map((p) => p.name)));
    }
  };

  const handleDelete = async () => {
    if (!deviceId || selected.size === 0) return;
    setError("");
    setFailedDeletes([]);
    const toDelete = vlans.filter((v) => selected.has(v.id));

    const results = await Promise.allSettled(
      toDelete.map((v) => api.deleteVlan(deviceId, v.vlanId))
    );

    const failures = results
      .map((r, i) => ({ r, vlanId: toDelete[i].vlanId }))
      .filter((x) => x.r.status === "rejected");

    if (failures.length > 0) {
      const first = failures[0].r as PromiseRejectedResult;
      setError(
        `Failed to delete VLAN ${failures[0].vlanId}: ${extractErrorMessage(
          first.reason,
          "Unknown error"
        )}`
      );
      setFailedDeletes(failures.map((f) => f.vlanId));
    }

    setSelected(new Set());
    await fetchVlans();
  };

  // For VLANs the switch rejects (usually because they already drifted off the device — see
  // vlanController.ts) — removes just the platform's record, no command sent to the device.
  const handleForceRemove = async () => {
    if (!deviceId || failedDeletes.length === 0) return;
    if (
      !confirm(
        `Remove VLAN ${failedDeletes.join(", ")} from this list only? This does not send any command to the device — only use this after confirming on the device itself that it no longer exists.`
      )
    )
      return;
    setForcing(true);
    setError("");
    try {
      await Promise.all(failedDeletes.map((id) => api.deleteVlan(deviceId, id, true)));
      setFailedDeletes([]);
      await fetchVlans();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to remove VLAN from platform records"));
    } finally {
      setForcing(false);
    }
  };

  const singleSelectedPort =
    selectedPorts.size === 1 ? ports.find((p) => selectedPorts.has(p.name)) ?? null : null;

  return (
    <div>
      <div className="flex items-center gap-6 border-b border-gray-200 dark:border-slate-700 mb-4 overflow-x-auto">
        {VLAN_SUB_TABS.map((tab) => (
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

      {!deviceId ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
        </div>
      ) : subTab === "aggregatePort" ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-400 dark:text-gray-500 text-sm">Aggregate Port List — Coming soon</p>
        </div>
      ) : subTab === "physicalPort" ? (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <button
              onClick={() => singleSelectedPort && setEditingPort(singleSelectedPort)}
              disabled={!singleSelectedPort}
              className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-40 disabled:hover:text-gray-700"
            >
              <Pencil size={15} /> Edit
            </button>
          </div>

          {portsError && <p className="text-red-500 text-sm mb-3">{portsError}</p>}

          {portsLoading ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">Loading ports...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-3 w-8">
                      <input
                        type="checkbox"
                        checked={ports.length > 0 && ports.every((p) => selectedPorts.has(p.name))}
                        onChange={toggleSelectAllPorts}
                      />
                    </th>
                    <th className="py-2 pr-3 font-medium">Port Description</th>
                    <th className="py-2 pr-3 font-medium">Port Type</th>
                    <th className="py-2 pr-3 font-medium">VLAN</th>
                    <th className="py-2 pr-3 font-medium">Operation</th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((p) => (
                    <tr key={p.name} className="border-b border-gray-100 dark:border-slate-700/60">
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          checked={selectedPorts.has(p.name)}
                          onChange={() => toggleSelectPort(p.name)}
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                        {p.description || p.name}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100 capitalize">
                        {p.portType}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{p.vlanId}</td>
                      <td className="py-2.5 pr-3">
                        <button
                          onClick={() => setEditingPort(p)}
                          className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {ports.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-400 dark:text-gray-500">
                        No ports reported by this device yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <Plus size={15} /> Add VLAN
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 disabled:opacity-40 disabled:hover:text-red-500"
            >
              <Trash2 size={15} /> Delete VLAN
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
            <p className="text-gray-400 dark:text-gray-500 text-sm">Loading VLANs...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-3 w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                    <th className="py-2 pr-3 font-medium">VLAN ID</th>
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Operation</th>
                  </tr>
                </thead>
                <tbody>
                  {vlans.map((v) => (
                    <tr key={v.id} className="border-b border-gray-100 dark:border-slate-700/60">
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          disabled={v.vlanId === 1}
                          checked={selected.has(v.id)}
                          onChange={() => toggleSelect(v.id)}
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{v.vlanId}</td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{v.name}</td>
                      <td className="py-2.5 pr-3">
                        <button
                          onClick={() => setEditingVlan(v)}
                          className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {vlans.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-gray-400 dark:text-gray-500">
                        No VLANs configured
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showAddModal && deviceId && (
        <AddVlanModal
          deviceId={deviceId}
          onClose={() => setShowAddModal(false)}
          onCreated={async () => {
            setShowAddModal(false);
            await fetchVlans();
          }}
        />
      )}

      {editingVlan && deviceId && (
        <EditVlanModal
          deviceId={deviceId}
          vlan={editingVlan}
          onClose={() => setEditingVlan(null)}
          onSaved={async () => {
            setEditingVlan(null);
            await fetchVlans();
          }}
        />
      )}

      {editingPort && deviceId && (
        <EditPortModal
          deviceId={deviceId}
          port={editingPort}
          onClose={() => setEditingPort(null)}
          onSaved={(updated) => {
            if (updated && updated.length > 0) {
              setPorts((cur) => {
                const byName = new Map(updated.map((p) => [p.name, p]));
                return cur.map((p) => (byName.has(p.name) ? { ...p, ...byName.get(p.name)! } : p));
              });
              const fresh = updated.find((p) => p.name === editingPort.name);
              if (fresh) setEditingPort(fresh);
            }
          }}
        />
      )}
    </div>
  );
};

const VLAN_ID_OR_RANGE_RE = /^\d+$|^\d+-\d+$/;

function AddVlanModal({
  deviceId,
  onClose,
  onCreated,
}: {
  deviceId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [vlanId, setVlanId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isRange = vlanId.includes("-");

  const handleSave = async () => {
    const trimmed = vlanId.trim();
    if (!VLAN_ID_OR_RANGE_RE.test(trimmed)) {
      setError("Enter a VLAN ID (e.g. 5) or a range (e.g. 2-10)");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.createVlan(deviceId, isRange ? trimmed : parseInt(trimmed, 10), name.trim() || undefined);
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create VLAN"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-sm p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add VLAN</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
            VLAN ID <span className="text-gray-400 font-normal">(or a range, e.g. 2-10)</span>
          </label>
          <input
            type="text"
            value={vlanId}
            onChange={(e) => setVlanId(e.target.value)}
            placeholder="e.g. 5 or 2-10"
            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
            Name <span className="text-gray-400 font-normal">(optional{isRange ? " — single VLAN only" : ""})</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isRange}
            placeholder={vlanId && !isRange ? `VLAN${vlanId}` : "VLAN name"}
            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
          />
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
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditVlanModal({
  deviceId,
  vlan,
  onClose,
  onSaved,
}: {
  deviceId: string;
  vlan: VlanRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(vlan.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.updateVlan(deviceId, vlan.vlanId, { name: name.trim() });
      onSaved();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update VLAN"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-sm p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Edit VLAN {vlan.vlanId}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Note: VLAN name is a platform-only label and is not pushed to the device.
        </p>

        <div className="flex justify-end gap-3 mt-2">
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

function EditPortModal({
  deviceId,
  port,
  onClose,
  onSaved,
}: {
  deviceId: string;
  port: PortRow;
  onClose: () => void;
  onSaved: (updated?: PortRow[]) => void;
}) {
  const [portType, setPortType] = useState<PortType>(port.portType);
  const [vlanId, setVlanId] = useState(String(port.vlanId));
  const [trunkAllowedVlan, setTrunkAllowedVlan] = useState(port.trunkAllowedVlan || "all");
  const [hybridAllowedVlan, setHybridAllowedVlan] = useState(port.hybridAllowedVlan || "all");
  const [hybridUntaggedVlan, setHybridUntaggedVlan] = useState(port.hybridUntaggedVlan || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldStatus, setFieldStatus] = useState<Record<string, { status: "pending" | "applied" | "failed"; message?: string }>>({});

  const handleSave = async () => {
    const parsed = parseInt(vlanId, 10);
    if (!vlanId || Number.isNaN(parsed) || parsed < 1 || parsed > 4094) {
      setError(`Enter a valid ${portType === "access" ? "access" : portType === "trunk" ? "native" : "PVID"} VLAN ID (1-4094)`);
      return;
    }

    const fields = ["portType", "vlanId", ...(portType === "trunk" ? ["trunkAllowedVlan"] : []), ...(portType === "hybrid" ? ["hybridAllowedVlan", "hybridUntaggedVlan"] : [])];
    setSaving(true);
    setError("");
    setFieldStatus(Object.fromEntries(fields.map((f) => [f, { status: "pending" as const }])));
    try {
      const res = await api.updatePort(deviceId, port.name, {
        portType,
        vlanId: parsed,
        ...(portType === "trunk" ? { trunkAllowedVlan } : {}),
        ...(portType === "hybrid" ? { hybridAllowedVlan, hybridUntaggedVlan: hybridUntaggedVlan || "none" } : {}),
      });
      const results = (res.data.data.results ?? {}) as Record<string, FieldResult>;
      setFieldStatus(
        Object.fromEntries(
          fields.map((f) => [f, results[f] ? { status: results[f].applied ? "applied" : "failed", message: results[f].message } : { status: "applied" }])
        )
      );
      onSaved(res.data.data.ports);
      if (!Object.values(results).some((r) => !r.applied)) onClose();
    } catch (err) {
      const result = extractPortUpdateResult(err);
      const results = result?.results ?? {};
      setFieldStatus(
        Object.fromEntries(fields.map((f) => [f, results[f] ? { status: results[f].applied ? "applied" : "failed", message: results[f].message } : { status: "failed" as const }]))
      );
      if (result?.ports) onSaved(result.ports);
      setError(extractErrorMessage(err, "Failed to update port"));
    } finally {
      setSaving(false);
    }
  };

  const FieldBadge = ({ field }: { field: string }) => {
    const s = fieldStatus[field];
    if (!s) return null;
    if (s.status === "pending") return <span className="text-[10px] text-gray-400 ml-2">sending…</span>;
    if (s.status === "applied") return <span className="text-[10px] text-green-600 ml-2">✓ applied to device</span>;
    return <span className="text-[10px] text-red-500 ml-2">✗ {s.message || "rejected"}</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-sm p-6 border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Port VLAN Configuration
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>
        {!port.deviceConfirmed && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3">
            Not confirmed on device — last saved config for this port was never acknowledged by the switch.
          </p>
        )}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="mb-4 flex items-center gap-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">Selected Port</span>
          <span className="text-gray-800 dark:text-gray-100 font-medium">{port.name}</span>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
            Port Type <FieldBadge field="portType" />
          </label>
          <div className="flex items-center gap-6">
            {(["access", "trunk", "hybrid"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 capitalize">
                <input type="radio" checked={portType === t} onChange={() => setPortType(t)} />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
            {portType === "access" ? "Access VLAN" : portType === "trunk" ? "Native VLAN" : "PVID"} <FieldBadge field="vlanId" />
          </label>
          <input
            type="number"
            value={vlanId}
            onChange={(e) => setVlanId(e.target.value)}
            className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          />
        </div>

        {portType === "trunk" && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Trunk Allowed VLANs <FieldBadge field="trunkAllowedVlan" />
              <span className="block font-normal text-[11px] text-gray-400 normal-case">"all", "none", or e.g. "2,5-10"</span>
            </label>
            <input
              type="text"
              value={trunkAllowedVlan}
              onChange={(e) => setTrunkAllowedVlan(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        )}

        {portType === "hybrid" && (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                Hybrid Allowed VLANs <FieldBadge field="hybridAllowedVlan" />
                <span className="block font-normal text-[11px] text-gray-400 normal-case">"all", "none", or e.g. "2,5-10"</span>
              </label>
              <input
                type="text"
                value={hybridAllowedVlan}
                onChange={(e) => setHybridAllowedVlan(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                Hybrid Untagged VLANs <FieldBadge field="hybridUntaggedVlan" />
                <span className="block font-normal text-[11px] text-gray-400 normal-case">must be a subset of the allowed list; leave empty for none</span>
              </label>
              <input
                type="text"
                value={hybridUntaggedVlan}
                onChange={(e) => setHybridUntaggedVlan(e.target.value)}
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 mt-2">
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

export default VlanConfiguration;
