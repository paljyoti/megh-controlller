import { useEffect, useState, useCallback } from "react";
import { RefreshCw, X } from "lucide-react";
import { api } from "../../services/api";

type PortSecuritySubTabKey = "switchportSecurity" | "secureMac";
type ViolationMode = "restrict" | "shutdown" | null;

const PORT_SECURITY_SUB_TABS: { key: PortSecuritySubTabKey; label: string }[] = [
  { key: "secureMac", label: "Secure MAC Addresses" },
  { key: "switchportSecurity", label: "Port Security" },
];

interface PortOption {
  name: string;
}

// "switchport port-security" — TR models only. Confirmed live against a real TR-MS2910-P
// terminal.
interface SwitchportSecurityRow {
  name: string;
  portSecurityEnabled: boolean;
  portSecurityAgingStatic: boolean;
  portSecurityAgingTime: number | null;
  portSecurityStickyMac: boolean;
  portSecurityMaximum: number | null;
  portSecurityViolationMode: ViolationMode;
  deviceConfirmed: boolean;
}

// "switchport port-security mac-address" — individually-configured secure MAC entries per
// port, separate from the global portSecurityStickyMac auto-learn toggle above. No VLAN
// argument (confirmed live).
interface SecureMacRow {
  id: string;
  port: string;
  macAddress: string;
  sticky: boolean;
}

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return message || fallback;
};

const PortSecurityConfiguration = ({ deviceId }: { deviceId?: string }) => {
  const [subTab, setSubTab] = useState<PortSecuritySubTabKey>("switchportSecurity");

  const [ports, setPorts] = useState<PortOption[]>([]);

  const [switchportSupported, setSwitchportSupported] = useState(false);
  const [switchportRows, setSwitchportRows] = useState<SwitchportSecurityRow[]>([]);
  const [switchportLoading, setSwitchportLoading] = useState(false);
  const [switchportError, setSwitchportError] = useState("");
  const [switchportSelected, setSwitchportSelected] = useState<Set<string>>(new Set());
  const [editingSwitchportPorts, setEditingSwitchportPorts] = useState<SwitchportSecurityRow[] | null>(null);

  const [secureMacs, setSecureMacs] = useState<SecureMacRow[]>([]);
  const [secureMacsLoading, setSecureMacsLoading] = useState(false);
  const [secureMacsError, setSecureMacsError] = useState("");
  const [secureMacSelected, setSecureMacSelected] = useState<Set<string>>(new Set());
  const [showAddSecureMacModal, setShowAddSecureMacModal] = useState(false);
  const [secureMacPage, setSecureMacPage] = useState(1);

  const fetchPorts = useCallback(async () => {
    if (!deviceId) return;
    setSwitchportLoading(true);
    try {
      const res = await api.getPorts(deviceId);
      setPorts(res.data.data.ports);
      setSwitchportRows(res.data.data.ports);
      setSwitchportSupported(!!res.data.data.portSecuritySwitchportSupported);
    } catch (err) {
      setSwitchportError(extractErrorMessage(err, "Failed to load ports"));
    } finally {
      setSwitchportLoading(false);
    }
  }, [deviceId]);

  const fetchSecureMacs = useCallback(async () => {
    if (!deviceId) return;
    setSecureMacsLoading(true);
    setSecureMacsError("");
    try {
      const res = await api.getPortSecurityMacs(deviceId);
      setSecureMacs(res.data.data.entries);
    } catch (err) {
      setSecureMacsError(extractErrorMessage(err, "Failed to load secure MAC addresses"));
    } finally {
      setSecureMacsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchPorts();
    fetchSecureMacs();
  }, [fetchPorts, fetchSecureMacs]);

  const toggleSwitchportSelect = (name: string) => {
    setSwitchportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSecureMacSelect = (id: string) => {
    setSecureMacSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSecureMacs = async () => {
    if (!deviceId || secureMacSelected.size === 0) return;
    setSecureMacsError("");
    const toDelete = secureMacs.filter((m) => secureMacSelected.has(m.id));

    const results = await Promise.allSettled(
      toDelete.map((m) => api.deletePortSecurityMac(deviceId, m.id))
    );
  
    const failures = results
      .map((r, i) => ({ r, entry: toDelete[i] }))
      .filter((x) => x.r.status === "rejected");

    if (failures.length > 0) {
      const first = failures[0].r as PromiseRejectedResult;
      setSecureMacsError(
        `Failed to remove ${failures[0].entry.macAddress}: ${extractErrorMessage(first.reason, "Unknown error")}`
      );
    }

    setSecureMacSelected(new Set());
    await fetchSecureMacs();         
  };

  return (
    <div>
      <div className="flex items-center gap-6 border-b border-gray-200 dark:border-slate-700 mb-4 overflow-x-auto">
        {PORT_SECURITY_SUB_TABS.filter(() => switchportSupported).map((tab) => (
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
      ) : !switchportSupported ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            Port Security is not supported on this device model.
          </p>
        </div>
      ) : subTab === "switchportSecurity" ? (
        <SwitchportSecurityTab
          rows={switchportRows}
          loading={switchportLoading}
          error={switchportError}
          selected={switchportSelected}
          onToggleSelect={toggleSwitchportSelect}
          onSelectAll={() =>
            setSwitchportSelected((prev) =>
              prev.size === switchportRows.length ? new Set() : new Set(switchportRows.map((r) => r.name))
            )
          }
          onRefresh={fetchPorts}
          onEdit={(rows) => setEditingSwitchportPorts(rows)}
        />
      ) : (
        <SecureMacTab
          entries={secureMacs}
          loading={secureMacsLoading}
          error={secureMacsError}
          selected={secureMacSelected}
          onToggleSelect={toggleSecureMacSelect}
          onSelectAll={() =>
            setSecureMacSelected((prev) =>
              prev.size === secureMacs.length ? new Set() : new Set(secureMacs.map((m) => m.id))
            )
          }
          onRefresh={fetchSecureMacs}
          onAdd={() => setShowAddSecureMacModal(true)}
          onDeleteSelected={handleDeleteSecureMacs}
          page={secureMacPage}
          setPage={setSecureMacPage}
        />
      )}

      {editingSwitchportPorts && deviceId && (
        <SwitchportSecurityModal
          deviceId={deviceId}
          ports={editingSwitchportPorts}
          onClose={() => setEditingSwitchportPorts(null)}
          onSaved={async () => {
            setEditingSwitchportPorts(null);
            setSwitchportSelected(new Set());
            await fetchPorts();
          }}
        />
      )}

      {showAddSecureMacModal && deviceId && (
        <AddSecureMacModal
          deviceId={deviceId}
          ports={ports}
          onClose={() => setShowAddSecureMacModal(false)}
          onCreated={async () => {
            setShowAddSecureMacModal(false);
            await fetchSecureMacs();
          }}
        />
      )}
    </div>
  );
};

function SwitchportSecurityTab({
  rows,
  loading,
  error,
  selected,
  onToggleSelect,
  onSelectAll,
  onRefresh,
  onEdit,
}: {
  rows: SwitchportSecurityRow[];
  loading: boolean;
  error: string;
  selected: Set<string>;
  onToggleSelect: (name: string) => void;
  onSelectAll: () => void;
  onRefresh: () => void;
  onEdit: (rows: SwitchportSecurityRow[]) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.name));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <button
          onClick={() => onEdit(rows.filter((r) => selected.has(r.name)))}
          disabled={selected.size === 0}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40"
        >
          Batch Edit
        </button>
        <button
          onClick={onRefresh}
          title="Refresh"
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading ports...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={onSelectAll} />
                </th>
                <th className="py-2 pr-3 font-medium">Port</th>
                <th className="py-2 pr-3 font-medium">Security</th>
                <th className="py-2 pr-3 font-medium">Sticky MAC</th>
                <th className="py-2 pr-3 font-medium">Aging</th>
                <th className="py-2 pr-3 font-medium">Maximum</th>
                <th className="py-2 pr-3 font-medium">Violation</th>
                <th className="py-2 pr-3 font-medium">State</th>
                <th className="py-2 pr-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-gray-100 dark:border-slate-700/60">
                  <td className="py-2.5 pr-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.name)}
                      onChange={() => onToggleSelect(r.name)}
                    />
                  </td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{r.name}</td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                    {r.portSecurityEnabled ? "Enabled" : "Disabled"}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                    {r.portSecurityStickyMac ? "Enabled" : "Disabled"}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                    {r.portSecurityAgingStatic
                      ? "Static"
                      : r.portSecurityAgingTime != null
                      ? `${r.portSecurityAgingTime} min`
                      : "--"}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                    {r.portSecurityMaximum ?? "--"}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100 capitalize">
                    {r.portSecurityViolationMode ?? "--"}
                  </td>
                  <td className="py-2.5 pr-3">
                    {r.deviceConfirmed ? (
                      <span className="text-xs text-green-600 dark:text-green-400">confirmed</span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">not confirmed</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <button
                      onClick={() => onEdit([r])}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-gray-400 dark:text-gray-500">
                    No ports reported by this device yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SwitchportSecurityModal({
  deviceId,
  ports,
  onClose,
  onSaved,
}: {
  deviceId: string;
  ports: SwitchportSecurityRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const first = ports[0]!;
  const [enabled, setEnabled] = useState(first.portSecurityEnabled);
  const [stickyMac, setStickyMac] = useState(first.portSecurityStickyMac);
  const [agingMode, setAgingMode] = useState<"none" | "static" | "time">(
    first.portSecurityAgingStatic ? "static" : first.portSecurityAgingTime != null ? "time" : "none"
  );
  const [agingTime, setAgingTime] = useState(
    first.portSecurityAgingTime != null ? String(first.portSecurityAgingTime) : ""
  );
  const [maxEnabled, setMaxEnabled] = useState(first.portSecurityMaximum != null);
  const [maximum, setMaximum] = useState(
    first.portSecurityMaximum != null ? String(first.portSecurityMaximum) : ""
  );
  const [violationEnabled, setViolationEnabled] = useState(first.portSecurityViolationMode !== null);
  const [violation, setViolation] = useState<"restrict" | "shutdown">(
    first.portSecurityViolationMode ?? "restrict"
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    let agingTimeNum: number | null = null;
    if (agingMode === "time") {
      agingTimeNum = parseInt(agingTime, 10);
      if (Number.isNaN(agingTimeNum) || agingTimeNum < 0 || agingTimeNum > 1440) {
        setError("Aging time must be between 0 and 1440 minutes");
        return;
      }
    }

    let maximumNum: number | null = null;
    if (maxEnabled) {
      maximumNum = parseInt(maximum, 10);
      if (Number.isNaN(maximumNum) || maximumNum < 1 || maximumNum > 1024) {
        setError("Maximum must be between 1 and 1024");
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      const names = ports.map((p) => p.name);
      await api.updatePort(deviceId, names.length === 1 ? names[0]! : names, {
        portSecurityEnabled: enabled,
        portSecurityAgingStatic: agingMode === "static",
        portSecurityAgingTime: agingTimeNum,
        portSecurityStickyMac: stickyMac,
        portSecurityMaximum: maximumNum,
        portSecurityViolationMode: violationEnabled ? violation : null,
      });
      onSaved();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update port security"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Port Security{ports.length > 1 ? ` (${ports.length} ports)` : ` — ${first.name}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              switchport port-security
            </label>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                enabled ? "bg-green-500" : "bg-gray-300 dark:bg-slate-600"
              }`}
            >
              <span
                className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                style={{ transform: enabled ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              <input type="checkbox" checked={stickyMac} onChange={(e) => setStickyMac(e.target.checked)} />
              Sticky MAC (auto-learn secure addresses)
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">Aging</label>
            <div className="flex gap-2 mb-2">
              {(["none", "static", "time"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAgingMode(m)}
                  className={`px-3 py-1.5 text-sm rounded-lg border ${
                    agingMode === m
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {m === "none" ? "Off" : m === "static" ? "Static" : "Time"}
                </button>
              ))}
            </div>
            {agingMode === "time" && (
              <input
                type="number"
                min={0}
                max={1440}
                value={agingTime}
                onChange={(e) => setAgingTime(e.target.value)}
                placeholder="Minutes (0-1440)"
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
              />
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              <input type="checkbox" checked={maxEnabled} onChange={(e) => setMaxEnabled(e.target.checked)} />
              Limit maximum secure MAC addresses
            </label>
            {maxEnabled && (
              <input
                type="number"
                min={1}
                max={1024}
                value={maximum}
                onChange={(e) => setMaximum(e.target.value)}
                placeholder="1-1024"
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
              />
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              <input
                type="checkbox"
                checked={violationEnabled}
                onChange={(e) => setViolationEnabled(e.target.checked)}
              />
              Violation action
            </label>
            {violationEnabled && (
              <div className="flex gap-2">
                {(["restrict", "shutdown"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setViolation(v)}
                    className={`px-3 py-1.5 text-sm rounded-lg border capitalize ${
                      violation === v
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
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

const SECURE_MAC_PAGE_SIZE = 10;

function SecureMacTab({
  entries,
  loading,
  error,
  selected,
  onToggleSelect,
  onSelectAll,
  onRefresh,
  onAdd,
  onDeleteSelected,
  page,
  setPage,
}: {
  entries: SecureMacRow[];
  loading: boolean;
  error: string;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onRefresh: () => void;
  onAdd: () => void;
  onDeleteSelected: () => void;
  page: number;
  setPage: (updater: (p: number) => number) => void;
}) {
  const allSelected = entries.length > 0 && entries.every((m) => selected.has(m.id));
  const totalPages = Math.max(1, Math.ceil(entries.length / SECURE_MAC_PAGE_SIZE));
  const pagedEntries = entries.slice((page - 1) * SECURE_MAC_PAGE_SIZE, page * SECURE_MAC_PAGE_SIZE);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onAdd}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            + Add
          </button>
          <button
            onClick={onDeleteSelected}
            disabled={selected.size === 0}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            ✕ Delete
          </button>
        </div>
        <button
          onClick={onRefresh}
          title="Refresh"
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading secure MAC addresses...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={onSelectAll} />
                </th>
                <th className="py-2 pr-3 font-medium">Port</th>
                <th className="py-2 pr-3 font-medium">MAC Address</th>
                <th className="py-2 pr-3 font-medium">Sticky</th>
              </tr>
            </thead>
            <tbody>
              {pagedEntries.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 dark:border-slate-700/60">
                  <td className="py-2.5 pr-3">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => onToggleSelect(m.id)} />
                  </td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{m.port}</td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{m.macAddress}</td>
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{m.sticky ? "Yes" : "No"}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400 dark:text-gray-500">
                    No Data
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
            <span>Total {entries.length}</span>
            <div className="flex items-center gap-3">
              <span>{SECURE_MAC_PAGE_SIZE}/page</span>
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddSecureMacModal({
  deviceId,
  ports,
  onClose,
  onCreated,
}: {
  deviceId: string;
  ports: PortOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [port, setPort] = useState("");
  const [macAddress, setMacAddress] = useState("");
  const [sticky, setSticky] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!port) {
      setError("Port is required");
      return;
    }
    if (!macAddress.trim()) {
      setError("MAC Address is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.createPortSecurityMac(deviceId, { port, macAddress: macAddress.trim(), sticky });
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to add secure MAC address"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-md max-h-[90vh] overflow-y-auto p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add Secure MAC</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Port</label>
            <select
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">Select port</option>
              {ports.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">MAC Address</label>
            <input
              type="text"
              value={macAddress}
              onChange={(e) => setMacAddress(e.target.value)}
              placeholder="0011.2233.4455"
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Dot-grouped format, no VLAN needed.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)} />
            Sticky (pre-seed as sticky-secured instead of a plain static entry)
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Confirm"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default PortSecurityConfiguration;
