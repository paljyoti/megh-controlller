import { useEffect, useState, useCallback } from "react";
import { X, Plus, Minus } from "lucide-react";
import { api } from "../../services/api";

type PoolStatus = "enabled" | "disabled";

interface AddressSegment {
  start: string;
  end: string;
}

interface DhcpPool {
  id: string;
  poolName: string;
  network: string;
  netmask: string;
  gateway: string;
  leasePeriod: "forever" | "custom";
  leaseDays: number | null;
  leaseHours: number | null;
  leaseMinutes: number | null;
  dns: string;
  backupDns: string | null;
  option43: string | null;
  addressSegments: AddressSegment[];
  status: PoolStatus;
  nakStatus: PoolStatus;
}

const PAGE_SIZE = 50;

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return message || fallback;
};

const DHCPConfiguration = ({ deviceId }: { deviceId?: string }) => {
  const [pools, setPools] = useState<DhcpPool[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);

  const allSelected = pools.length > 0 && pools.every((p) => selected.has(p.id));
  const totalPages = Math.max(1, Math.ceil(pools.length / PAGE_SIZE));
  const pagedPools = pools.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fetchPools = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.getDhcpPools(deviceId);
      setPools(res.data.data.pools);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load DHCP pools"));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchPools();
    setSelected(new Set());
    setPage(1);
  }, [fetchPools]);

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
    else setSelected(new Set(pools.map((p) => p.id)));
  };

  const handleDelete = async (ids?: Set<string>) => {
    if (!deviceId) return;
    const targetIds = ids ?? selected;
    if (targetIds.size === 0) return;
    setError("");
    const toDelete = pools.filter((p) => targetIds.has(p.id));

    const results = await Promise.allSettled(
      toDelete.map((p) => api.deleteDhcpPool(deviceId, p.id))
    );

    const failures = results
      .map((r, i) => ({ r, pool: toDelete[i] }))
      .filter((x) => x.r.status === "rejected");

    if (failures.length > 0) {
      const first = failures[0].r as PromiseRejectedResult;
      setError(
        `Failed to delete pool ${failures[0].pool.network}: ${extractErrorMessage(
          first.reason,
          "Unknown error"
        )}`
      );
    }

    setSelected(new Set());
    await fetchPools();
  };

  const setStatusForSelected = async (field: "status" | "nakStatus", value: PoolStatus) => {
    if (!deviceId || selected.size === 0) return;
    setError("");
    const targets = pools.filter((p) => selected.has(p.id));

    const results = await Promise.allSettled(
      targets.map((p) =>
        field === "status"
          ? api.updateDhcpPoolStatus(deviceId, p.id, value)
          : api.updateDhcpPoolNakStatus(deviceId, p.id, value)
      )
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      const first = failures[0] as PromiseRejectedResult;
      setError(extractErrorMessage(first.reason, "Failed to update DHCP pool"));
    }

    await fetchPools();
  };

  return (
    <div>
      {!deviceId ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-block w-1 h-4 bg-blue-600 dark:bg-blue-400 rounded-sm" />
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              DHCPPoolConfig
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              + New
            </button>
            <button
              onClick={() => handleDelete()}
              disabled={selected.size === 0}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              🗑 Delete
            </button>
            <button
              onClick={() => setStatusForSelected("status", "enabled")}
              disabled={selected.size === 0}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Global Enable
            </button>
            <button
              onClick={() => setStatusForSelected("status", "disabled")}
              disabled={selected.size === 0}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Global Disable
            </button>
            <button
              onClick={() => setStatusForSelected("nakStatus", "enabled")}
              disabled={selected.size === 0}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Nak Enable
            </button>
            <button
              onClick={() => setStatusForSelected("nakStatus", "disabled")}
              disabled={selected.size === 0}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Nak Disable
            </button>
          </div>

          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          {loading ? (
            <p className="text-gray-400 dark:text-gray-500 text-sm">Loading DHCP pools...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-3 w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                    <th className="py-2 pr-3 font-medium">Network</th>
                    <th className="py-2 pr-3 font-medium">Netmask</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Nak Status</th>
                    <th className="py-2 pr-3 font-medium">Operation</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPools.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 dark:border-slate-700/60">
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{p.network}</td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{p.netmask}</td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100 capitalize">
                        {p.status}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100 capitalize">
                        {p.nakStatus}
                      </td>
                      <td className="py-2.5 pr-3">
                        <button
                          onClick={() => handleDelete(new Set([p.id]))}
                          className="text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pools.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-gray-400 dark:text-gray-500">
                        No Data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
                <span>Total {pools.length}</span>
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
        <AddDhcpPoolModal
          deviceId={deviceId}
          onClose={() => setShowAddModal(false)}
          onCreated={async () => {
            setShowAddModal(false);
            await fetchPools();
          }}
        />
      )}
    </div>
  );
};

function AddDhcpPoolModal({
  deviceId,
  onClose,
  onCreated,
}: {
  deviceId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [gateway, setGateway] = useState("");
  const [mask, setMask] = useState("");
  const [leasePeriod, setLeasePeriod] = useState<"forever" | "custom">("forever");
  const [leaseDays, setLeaseDays] = useState("0");
  const [leaseHours, setLeaseHours] = useState("0");
  const [leaseMinutes, setLeaseMinutes] = useState("0");
  const [dns, setDns] = useState("");
  const [backupDns, setBackupDns] = useState("");
  const [option43, setOption43] = useState("");
  const [segments, setSegments] = useState<AddressSegment[]>([{ start: "", end: "" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateSegment = (index: number, field: keyof AddressSegment, value: string) => {
    setSegments((prev) =>
      prev.map((seg, i) => (i === index ? { ...seg, [field]: value } : seg))
    );
  };

  const addSegment = () => setSegments((prev) => [...prev, { start: "", end: "" }]);
  const removeSegment = (index: number) =>
    setSegments((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const handleSave = async () => {
    if (!gateway.trim() || !mask.trim()) {
      setError("Default Gateway / Mask is required");
      return;
    }
    if (leasePeriod === "custom") {
      const d = parseInt(leaseDays, 10);
      const h = parseInt(leaseHours, 10);
      const m = parseInt(leaseMinutes, 10);
      if (Number.isNaN(d) || Number.isNaN(h) || Number.isNaN(m) || (d === 0 && h === 0 && m === 0)) {
        setError("Custom lease period must be greater than 0");
        return;
      }
    }
    if (!dns.trim()) {
      setError("DNS is required");
      return;
    }
    const validSegments = segments.filter((s) => s.start.trim() && s.end.trim());
    if (validSegments.length === 0) {
      setError("At least one Address Segment is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.createDhcpPool(deviceId, {
        gateway: gateway.trim(),
        netmask: mask.trim(),
        leasePeriod,
        leaseDays: leasePeriod === "custom" ? parseInt(leaseDays, 10) : undefined,
        leaseHours: leasePeriod === "custom" ? parseInt(leaseHours, 10) : undefined,
        leaseMinutes: leasePeriod === "custom" ? parseInt(leaseMinutes, 10) : undefined,
        dns: dns.trim(),
        backupDns: backupDns.trim() || undefined,
        option43: option43.trim() || undefined,
        addressSegments: validSegments,
      });
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create DHCP pool"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">dhcp config</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-5">
          <FormRow label="Default Gateway/ Mask" required>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={gateway}
                onChange={(e) => setGateway(e.target.value)}
                placeholder="192.168.1.1"
                className={`${inputCls} w-44`}
              />
              <span className="text-gray-400">/</span>
              <input
                type="text"
                value={mask}
                onChange={(e) => setMask(e.target.value)}
                placeholder="255.255.255.0"
                className={`${inputCls} w-44`}
              />
            </div>
          </FormRow>

          <FormRow label="Lease Period" required alignTop>
            <div>
              <div className="flex items-center gap-6 h-[38px]">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="radio"
                    checked={leasePeriod === "forever"}
                    onChange={() => setLeasePeriod("forever")}
                  />
                  forever
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="radio"
                    checked={leasePeriod === "custom"}
                    onChange={() => setLeasePeriod("custom")}
                  />
                  custom
                </label>
              </div>
              {leasePeriod === "custom" && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={0}
                    value={leaseDays}
                    onChange={(e) => setLeaseDays(e.target.value)}
                    className={`${inputCls} w-16 !border-green-400 dark:!border-green-600`}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Day</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={leaseHours}
                    onChange={(e) => setLeaseHours(e.target.value)}
                    className={`${inputCls} w-16 !border-green-400 dark:!border-green-600`}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Hour</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={leaseMinutes}
                    onChange={(e) => setLeaseMinutes(e.target.value)}
                    className={`${inputCls} w-16 !border-green-400 dark:!border-green-600`}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Minute</span>
                </div>
              )}
            </div>
          </FormRow>

          <FormRow label="DNS" required>
            <input
              type="text"
              value={dns}
              onChange={(e) => setDns(e.target.value)}
              placeholder="114.114.114.114"
              className={`${inputCls} w-full max-w-xs`}
            />
          </FormRow>

          <FormRow label="Backup DNS">
            <input
              type="text"
              value={backupDns}
              onChange={(e) => setBackupDns(e.target.value)}
              className={`${inputCls} w-full max-w-xs`}
            />
          </FormRow>

          <FormRow label="Option 43">
            <input
              type="text"
              value={option43}
              onChange={(e) => setOption43(e.target.value)}
              className={`${inputCls} w-full max-w-xs`}
            />
          </FormRow>

          <FormRow label="Address Segment" required alignTop>
            <div className="space-y-2">
              {segments.map((seg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={seg.start}
                    onChange={(e) => updateSegment(i, "start", e.target.value)}
                    className={`${inputCls} w-40`}
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="text"
                    value={seg.end}
                    onChange={(e) => updateSegment(i, "end", e.target.value)}
                    className={`${inputCls} w-40`}
                  />
                  <button
                    type="button"
                    onClick={() => removeSegment(i)}
                    disabled={segments.length === 1}
                    className="shrink-0 p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    <Minus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={addSegment}
                    className="shrink-0 p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
          </FormRow>
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

function FormRow({
  label,
  required,
  alignTop,
  children,
}: {
  label: string;
  required?: boolean;
  alignTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-[150px_1fr] gap-x-4 ${alignTop ? "items-start" : "items-center"}`}
    >
      <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
        {required && <span className="text-red-500">*</span>} {label}
      </label>
      {children}
    </div>
  );
}

export default DHCPConfiguration;
