import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, X, AlertTriangle } from "lucide-react";
import { api } from "../../services/api";

type InterfaceKind = "svi" | "routedPort";

interface L3Row {
  id: string;
  interfaceKind: InterfaceKind;
  interfaceName: string;
  vlanId: number | null;
  port: string | null;
  ipv4Address: string | null;
  ipv6Address: string | null;
  deviceConfirmed: boolean;
}

interface VlanOption {
  vlanId: number;
  name: string;
}

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
};

const L3Interface = ({ deviceId }: { deviceId?: string }) => {
  const [rows, setRows] = useState<L3Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.getL3Interfaces(deviceId);
      setRows(res.data.data.l3Interfaces);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load L3 interfaces"));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleDelete = async (row: L3Row) => {
    if (!deviceId) return;
    if (!confirm(`Remove L3 addressing from ${row.interfaceName}? This can affect device reachability.`)) return;
    setError("");
    try {
      await api.deleteL3Address(deviceId, row.id);
      await fetchRows();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to remove L3 address"));
    }
  };

  return (
    <div>
      <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Setting a VLAN interface's (SVI) primary IP replaces the device's management address —
          it can disconnect this platform from the switch if applied to the wrong VLAN. Double-check
          before confirming.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 mb-4">
        <button
          onClick={() => setShowAddModal(true)}
          disabled={!deviceId}
          className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-40"
        >
          <Plus size={15} /> Add L3 Address
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {!deviceId ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
      ) : loading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-3 font-medium">Interface</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">IPv4</th>
                <th className="py-2 pr-3 font-medium">IPv6</th>
                <th className="py-2 pr-3 font-medium">State</th>
                <th className="py-2 pr-3 font-medium">Operation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 dark:border-slate-700/60">
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{r.interfaceName}</td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                    {r.interfaceKind === "svi" ? "SVI" : "Routed Port"}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{r.ipv4Address || "-"}</td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{r.ipv6Address || "-"}</td>
                  <td className="py-2.5 pr-3">
                    {r.deviceConfirmed ? (
                      <span className="text-xs text-green-600 dark:text-green-400">confirmed</span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">not confirmed</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <button
                      onClick={() => handleDelete(r)}
                      className="text-red-500 hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-400 dark:text-gray-500">
                    No L3 interfaces configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && deviceId && (
        <AddL3Modal
          deviceId={deviceId}
          existingNames={new Set(rows.map((r) => r.interfaceName))}
          onClose={() => setShowAddModal(false)}
          onSaved={async () => {
            setShowAddModal(false);
            await fetchRows();
          }}
        />
      )}
    </div>
  );
};

function AddL3Modal({
  deviceId,
  existingNames,
  onClose,
  onSaved,
}: {
  deviceId: string;
  existingNames: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Routed-port L3 addressing is intentionally not offered here — SVI only.
  const kind: InterfaceKind = "svi";
  const [vlans, setVlans] = useState<VlanOption[]>([]);
  const [vlanId, setVlanId] = useState("");
  const [ipv4Address, setIpv4Address] = useState("");
  const [ipv6Address, setIpv6Address] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Record<string, { applied: boolean; message?: string }> | null>(null);

  useEffect(() => {
    api.getVlans(deviceId).then((res) => setVlans(res.data.data.vlans)).catch(() => {});
  }, [deviceId]);

  const targetName = vlanId ? `vlan${vlanId}` : "";
  const alreadyExists = targetName ? existingNames.has(targetName) : false;

  const handleSave = async () => {
    const v = parseInt(vlanId, 10);
    if (!vlanId || Number.isNaN(v) || v < 1 || v > 4094) {
      setError("Select a valid VLAN");
      return;
    }
    if (!ipv4Address.trim() && !ipv6Address.trim()) {
      setError("Enter an IPv4 and/or IPv6 address");
      return;
    }
    if (!confirmed) {
      setError("You must check the confirmation box — this can change device reachability");
      return;
    }

    setSaving(true);
    setError("");
    setResults(null);
    try {
      const res = await api.setL3Address(deviceId, {
        interfaceKind: kind,
        vlanId: parseInt(vlanId, 10),
        ...(ipv4Address.trim() ? { ipv4Address: ipv4Address.trim() } : {}),
        ...(ipv6Address.trim() ? { ipv6Address: ipv6Address.trim() } : {}),
        confirm: true,
      });
      const r = res.data.data.results as Record<string, { applied: boolean; message?: string }> | undefined;
      if (r && Object.values(r).some((f) => !f.applied)) {
        setResults(r);
      } else {
        onSaved();
      }
    } catch (err) {
      const body = (err as { response?: { data?: { data?: { results?: Record<string, { applied: boolean; message?: string }> } } } })
        ?.response?.data?.data;
      if (body?.results) setResults(body.results);
      setError(extractErrorMessage(err, "Failed to set L3 address"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-md p-6 border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add L3 Address</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        {results && (
          <div className="mb-3 text-xs space-y-1">
            {Object.entries(results).map(([field, r]) => (
              <p key={field} className={r.applied ? "text-green-600 dark:text-green-400" : "text-red-500"}>
                {field}: {r.applied ? "applied" : r.message || "rejected"}
              </p>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">VLAN</label>
            <select
              value={vlanId}
              onChange={(e) => setVlanId(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Select</option>
              {vlans.map((v) => (
                <option key={v.vlanId} value={v.vlanId}>
                  VLAN {v.vlanId} ({v.name})
                </option>
              ))}
            </select>
          </div>

          {alreadyExists && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {targetName} already has L3 addressing — saving will update its primary address(es).
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">IPv4 Address</label>
            <input
              type="text"
              value={ipv4Address}
              onChange={(e) => setIpv4Address(e.target.value)}
              placeholder="e.g. 192.168.1.1/24"
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">IPv6 Address</label>
            <input
              type="text"
              value={ipv6Address}
              onChange={(e) => setIpv6Address(e.target.value)}
              placeholder="e.g. 2001:db8::1/64"
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            I understand this can replace the device's management IP and may disconnect this
            platform from the switch if misconfigured.
          </label>
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
            disabled={saving || !confirmed}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default L3Interface;
