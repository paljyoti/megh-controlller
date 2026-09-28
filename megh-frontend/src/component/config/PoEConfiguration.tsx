import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "../../services/api";

type PoePriority = "low" | "medium" | "high";
type PdDetectMode = "by-flow" | "by-ping" | null;

interface PortRow {
  name: string;
  poeEnabled: boolean;
  poePriority: PoePriority;
  poeMaxPower: number | null;
  poeForceOn: boolean;
  poeLegacyMode: boolean;
  poePdDescription: string | null;
  poePdDetectMode: PdDetectMode;
  poePdDetectPeerIp: string | null;
  poePdDetectInterval: number | null;
  poePdDetectTimes: number | null;
  deviceConfirmed: boolean;
}

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
};

const PoEConfiguration = ({ deviceId }: { deviceId?: string }) => {
  const [powerBudget, setPowerBudget] = useState("");
  const [legacyMode, setLegacyMode] = useState(false);
  const [legacyConfirm, setLegacyConfirm] = useState(false);
  // TR-only globals. undefined from the API = not supported on this model.
  const [legacyModeGlobal, setLegacyModeGlobal] = useState(true);
  const [powerReserved, setPowerReserved] = useState("");
  const [powerReservedSupported, setPowerReservedSupported] = useState(false);
  const [powerAlarmEnabled, setPowerAlarmEnabled] = useState(false);
  const [powerAlarmPercent, setPowerAlarmPercent] = useState("75");
  const [powerAlarmSupported, setPowerAlarmSupported] = useState(false);

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [legacySaving, setLegacySaving] = useState(false);
  const [reservedSaving, setReservedSaving] = useState(false);
  const [alarmSaving, setAlarmSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");

  const [ports, setPorts] = useState<PortRow[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [portsError, setPortsError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingPorts, setEditingPorts] = useState<PortRow[] | null>(null);

  // Advanced per-port PoE (priority/max-power/force/legacy/pd-description) only exists on
  // models where legacy mode is per-port rather than global — see poeController.ts.
  const advanced = !legacyModeGlobal;

  const fetchSettings = useCallback(async () => {
    if (!deviceId) return;
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const res = await api.getPoeSettings(deviceId);
      const d = res.data.data;
      setPowerBudget(d.powerBudget != null ? String(d.powerBudget) : "");
      setLegacyModeGlobal(d.legacyModeGlobal);
      if (d.legacyModeGlobal) setLegacyMode(d.legacyMode);
      setPowerReservedSupported(d.powerReservedPercent !== undefined);
      if (d.powerReservedPercent !== undefined) setPowerReserved(String(d.powerReservedPercent));
      setPowerAlarmSupported(d.powerAlarmPercent !== undefined);
      if (d.powerAlarmPercent !== undefined) {
        setPowerAlarmEnabled(d.powerAlarmPercent !== null);
        if (d.powerAlarmPercent !== null) setPowerAlarmPercent(String(d.powerAlarmPercent));
      }
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to load PoE settings"));
    } finally {
      setSettingsLoading(false);
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
    fetchSettings();
    fetchPorts();
  }, [fetchSettings, fetchPorts]);

  const handleSaveBudget = async () => {
    if (!deviceId) return;
    const trimmed = powerBudget.trim();
    const watts = trimmed === "" ? null : Number(trimmed);
    if (watts !== null && (Number.isNaN(watts) || watts <= 0)) {
      setSettingsError("Enter a positive wattage, or leave empty to clear");
      return;
    }
    setBudgetSaving(true);
    setSettingsError("");
    setSettingsSuccess("");
    try {
      await api.updatePoePowerBudget(deviceId, watts);
      setSettingsSuccess("PoE power supply updated");
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to update PoE power supply"));
    } finally {
      setBudgetSaving(false);
    }
  };

  const handleSaveLegacy = async () => {
    if (!deviceId) return;
    if (legacyMode && !legacyConfirm) {
      setSettingsError("Check the confirmation box before enabling legacy mode");
      return;
    }
    setLegacySaving(true);
    setSettingsError("");
    setSettingsSuccess("");
    try {
      await api.updatePoeLegacyMode(deviceId, legacyMode, legacyMode ? true : undefined);
      setSettingsSuccess("PoE legacy mode updated");
      setLegacyConfirm(false);
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to update PoE legacy mode"));
    } finally {
      setLegacySaving(false);
    }
  };

  const handleSaveReserved = async () => {
    if (!deviceId) return;
    const v = parseInt(powerReserved, 10);
    if (Number.isNaN(v) || v < 0 || v > 50) {
      setSettingsError("Power reserved must be between 0 and 50");
      return;
    }
    setReservedSaving(true);
    setSettingsError("");
    setSettingsSuccess("");
    try {
      await api.updatePoePowerReserved(deviceId, v);
      setSettingsSuccess("PoE power reserved updated");
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to update PoE power reserved"));
    } finally {
      setReservedSaving(false);
    }
  };

  const handleSaveAlarm = async () => {
    if (!deviceId) return;
    let percent: number | null = null;
    if (powerAlarmEnabled) {
      percent = parseInt(powerAlarmPercent, 10);
      if (Number.isNaN(percent) || percent < 50 || percent > 99) {
        setSettingsError("Power alarm must be between 50 and 99");
        return;
      }
    }
    setAlarmSaving(true);
    setSettingsError("");
    setSettingsSuccess("");
    try {
      await api.updatePoePowerAlarm(deviceId, percent);
      setSettingsSuccess("PoE power alarm updated");
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to update PoE power alarm"));
    } finally {
      setAlarmSaving(false);
    }
  };

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const applyUpdatedPorts = (updated?: PortRow[]) => {
    if (!updated) return;
    setPorts((cur) => {
      const byName = new Map(updated.map((p) => [p.name, p]));
      return cur.map((p) => (byName.has(p.name) ? { ...p, ...byName.get(p.name)! } : p));
    });
  };

  const quickToggleEnabled = async (port: PortRow) => {
    if (!deviceId) return;
    setPortsError("");
    try {
      const res = await api.updatePort(deviceId, port.name, { poeEnabled: !port.poeEnabled });
      applyUpdatedPorts(res.data.data.ports as PortRow[] | undefined);
      const results = res.data.data.results as Record<string, { applied: boolean; message?: string }> | undefined;
      const failed = results && Object.entries(results).find(([, r]) => !r.applied);
      if (failed) setPortsError(`${port.name}: ${failed[1].message || "rejected by device"}`);
    } catch (err) {
      setPortsError(extractErrorMessage(err, `Failed to update ${port.name}`));
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
      <div className="max-w-2xl mb-8">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Global Configuration</h3>
        {settingsError && <p className="text-red-500 text-sm mb-3">{settingsError}</p>}
        {settingsSuccess && <p className="text-green-600 dark:text-green-400 text-sm mb-3">{settingsSuccess}</p>}

        {settingsLoading ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
        ) : (
          <div className="grid grid-cols-[160px_1fr_auto] gap-x-3 gap-y-3 items-center">
            <label className="text-sm text-gray-600 dark:text-gray-300">Power supply (W)</label>
            <input
              type="number"
              value={powerBudget}
              onChange={(e) => setPowerBudget(e.target.value)}
              placeholder="default (port count × 15.4W)"
              className="w-56 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleSaveBudget}
              disabled={budgetSaving}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {budgetSaving ? "Saving..." : "Apply"}
            </button>

            {powerReservedSupported && (
              <>
                <label className="text-sm text-gray-600 dark:text-gray-300">Power reserved (%)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={powerReserved}
                  onChange={(e) => setPowerReserved(e.target.value)}
                  className="w-32 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={handleSaveReserved}
                  disabled={reservedSaving}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {reservedSaving ? "Saving..." : "Apply"}
                </button>
              </>
            )}

            {powerAlarmSupported && (
              <>
                <label className="text-sm text-gray-600 dark:text-gray-300">Power alarm</label>
                <div className="flex items-center gap-3">
                  <button
                    role="switch"
                    aria-checked={powerAlarmEnabled}
                    onClick={() => setPowerAlarmEnabled((v) => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      powerAlarmEnabled ? "bg-green-500" : "bg-gray-300 dark:bg-slate-600"
                    }`}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                      style={{ transform: powerAlarmEnabled ? "translateX(18px)" : "translateX(2px)" }}
                    />
                  </button>
                  {powerAlarmEnabled && (
                    <>
                      <input
                        type="number"
                        min={50}
                        max={99}
                        value={powerAlarmPercent}
                        onChange={(e) => setPowerAlarmPercent(e.target.value)}
                        className="w-24 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                      />
                      <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
                    </>
                  )}
                </div>
                <button
                  onClick={handleSaveAlarm}
                  disabled={alarmSaving}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {alarmSaving ? "Saving..." : "Apply"}
                </button>
              </>
            )}

            {legacyModeGlobal && (
              <>
                <label className="text-sm text-gray-600 dark:text-gray-300">Legacy mode</label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input type="checkbox" checked={legacyMode} onChange={(e) => setLegacyMode(e.target.checked)} />
                  Enable PoE legacy mode
                </label>
                <button
                  onClick={handleSaveLegacy}
                  disabled={legacySaving || (legacyMode && !legacyConfirm)}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {legacySaving ? "Saving..." : "Apply"}
                </button>
                {legacyMode && (
                  <div className="col-span-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <label className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                      <input
                        type="checkbox"
                        checked={legacyConfirm}
                        onChange={(e) => setLegacyConfirm(e.target.checked)}
                        className="mt-0.5"
                      />
                      I understand enabling this on a port not connected to a PD device can
                      damage it — only use this if a connected device needs legacy PoE detection.
                    </label>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Port Configuration</h3>
        {advanced && (
          <button
            onClick={() => setEditingPorts(ports.filter((p) => selected.has(p.name)))}
            disabled={selected.size === 0}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:hover:no-underline"
          >
            Batch Edit
          </button>
        )}
      </div>
      {portsError && <p className="text-red-500 text-sm mb-3">{portsError}</p>}
      {portsLoading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading ports...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                {advanced && <th className="py-2 pr-3 w-8"></th>}
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Admin State</th>
                {advanced && (
                  <>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 font-medium">Max power (W)</th>
                    <th className="py-2 pr-3 font-medium">Priority</th>
                    <th className="py-2 pr-3 font-medium">Legacy mode</th>
                  </>
                )}
                <th className="py-2 pr-3 font-medium">State</th>
                {advanced && <th className="py-2 pr-3 font-medium">Action</th>}
              </tr>
            </thead>
            <tbody>
              {ports.map((p) => (
                <tr key={p.name} className="border-b border-gray-100 dark:border-slate-700/60">
                  {advanced && (
                    <td className="py-2.5 pr-3">
                      <input type="checkbox" checked={selected.has(p.name)} onChange={() => toggleSelect(p.name)} />
                    </td>
                  )}
                  <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{p.name}</td>
                  <td className="py-2.5 pr-3">
                    {advanced ? (
                      <span className="text-gray-800 dark:text-gray-100">
                        {p.poeForceOn ? "Force_on" : p.poeEnabled ? "Enable" : "Disabled"}
                      </span>
                    ) : (
                      <button
                        role="switch"
                        aria-checked={p.poeEnabled}
                        onClick={() => quickToggleEnabled(p)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          p.poeEnabled ? "bg-green-500" : "bg-gray-300 dark:bg-slate-600"
                        }`}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                          style={{ transform: p.poeEnabled ? "translateX(18px)" : "translateX(2px)" }}
                        />
                      </button>
                    )}
                  </td>
                  {advanced && (
                    <>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{p.poePdDescription || "--"}</td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{p.poeMaxPower ?? "--"}</td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100 capitalize">{p.poePriority}</td>
                      <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">
                        {p.poeLegacyMode ? "Enabled" : "Disabled"}
                      </td>
                    </>
                  )}
                  <td className="py-2.5 pr-3">
                    {p.deviceConfirmed ? (
                      <span className="text-xs text-green-600 dark:text-green-400">confirmed</span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">not confirmed</span>
                    )}
                  </td>
                  {advanced && (
                    <td className="py-2.5 pr-3">
                      <button
                        onClick={() => setEditingPorts([p])}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {ports.length === 0 && (
                <tr>
                  <td colSpan={advanced ? 9 : 3} className="py-4 text-center text-gray-400 dark:text-gray-500">
                    No ports reported by this device yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingPorts && deviceId && (
        <PortConfigModal
          deviceId={deviceId}
          ports={editingPorts}
          onClose={() => setEditingPorts(null)}
          onSaved={async () => {
            setEditingPorts(null);
            setSelected(new Set());
            await fetchPorts();
          }}
        />
      )}
    </div>
  );
};

function PortConfigModal({
  deviceId,
  ports,
  onClose,
  onSaved,
}: {
  deviceId: string;
  ports: PortRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const first = ports[0]!;
  const [adminState, setAdminState] = useState<"disabled" | "enable" | "force_on">(
    first.poeForceOn ? "force_on" : first.poeEnabled ? "enable" : "disabled"
  );
  const [description, setDescription] = useState(first.poePdDescription ?? "");
  const [maxPower, setMaxPower] = useState(first.poeMaxPower != null ? String(first.poeMaxPower) : "");
  const [priority, setPriority] = useState<PoePriority>(first.poePriority);
  const [legacyMode, setLegacyMode] = useState(first.poeLegacyMode);
  const [pdDetectEnabled, setPdDetectEnabled] = useState(first.poePdDetectMode !== null);
  const [pdDetectMode, setPdDetectMode] = useState<"by-flow" | "by-ping">(first.poePdDetectMode ?? "by-flow");
  const [pdDetectPeerIp, setPdDetectPeerIp] = useState(first.poePdDetectPeerIp ?? "");
  const [pdDetectInterval, setPdDetectInterval] = useState(
    first.poePdDetectInterval != null ? String(first.poePdDetectInterval) : "10"
  );
  const [pdDetectTimes, setPdDetectTimes] = useState(
    first.poePdDetectTimes != null ? String(first.poePdDetectTimes) : "3"
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    let maxPowerNum: number | null = null;
    if (maxPower.trim()) {
      maxPowerNum = parseInt(maxPower, 10);
      if (Number.isNaN(maxPowerNum) || maxPowerNum < 1 || maxPowerNum > 90) {
        setError("Max power must be between 1 and 90 (30 for PoE+ ports, 90 for PoE++ ports)");
        return;
      }
    }

    const pdDetectData: {
      poePdDetectMode?: "none" | "by-flow" | "by-ping";
      poePdDetectPeerIp?: string;
      poePdDetectInterval?: number;
      poePdDetectTimes?: number;
    } = {};
    if (pdDetectEnabled) {
      if (pdDetectMode === "by-ping") {
        if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(pdDetectPeerIp.trim())) {
          setError("Enter a valid peer IP address for by-ping detection");
          return;
        }
        pdDetectData.poePdDetectPeerIp = pdDetectPeerIp.trim();
      }
      const interval = parseInt(pdDetectInterval, 10);
      const times = parseInt(pdDetectTimes, 10);
      if (Number.isNaN(interval) || interval < 5 || interval > 60) {
        setError("Detect interval must be between 5 and 60 seconds");
        return;
      }
      if (Number.isNaN(times) || times < 3 || times > 30) {
        setError("Detect times must be between 3 and 30");
        return;
      }
      pdDetectData.poePdDetectMode = pdDetectMode;
      pdDetectData.poePdDetectInterval = interval;
      pdDetectData.poePdDetectTimes = times;
    } else if (first.poePdDetectMode !== null) {
      pdDetectData.poePdDetectMode = "none";
    }

    setSaving(true);
    setError("");
    try {
      const names = ports.map((p) => p.name);
      await api.updatePort(deviceId, names.length === 1 ? names[0]! : names, {
        poeEnabled: adminState === "enable" || adminState === "force_on",
        poeForceOn: adminState === "force_on",
        poePdDescription: description.trim() || null,
        poeMaxPower: maxPowerNum,
        poePriority: priority,
        poeLegacyMode: legacyMode,
        ...pdDetectData,
      });
      onSaved();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update port configuration"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden p-6 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Port Configuration{ports.length > 1 ? ` (${ports.length} ports)` : ` — ${first.name}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              <span className="text-red-500">*</span> Admin State
            </label>
            <div className="flex gap-2">
              {(["disabled", "enable", "force_on"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAdminState(s)}
                  className={`px-3 py-1.5 text-sm rounded-lg border ${
                    adminState === s
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {s === "disabled" ? "Disabled" : s === "enable" ? "Enable" : "Force_on"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please input"
              maxLength={32}
              className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          {adminState !== "disabled" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Max power (W)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={maxPower}
                  onChange={(e) => setMaxPower(e.target.value)}
                  placeholder="Range (1-90)"
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">
                  <span className="text-red-500">*</span> Priority
                </label>
                <div className="flex gap-2">
                  {(["low", "medium", "high"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`px-4 py-1.5 text-sm rounded-lg border capitalize ${
                        priority === p
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5">
                  Legacy mode
                </label>
                <button
                  role="switch"
                  aria-checked={legacyMode}
                  onClick={() => setLegacyMode((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    legacyMode ? "bg-green-500" : "bg-gray-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                    style={{ transform: legacyMode ? "translateX(18px)" : "translateX(2px)" }}
                  />
                </button>
                {legacyMode && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-start gap-1.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    Can damage a connected device if this port isn't attached to a PD.
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">
                  <input
                    type="checkbox"
                    checked={pdDetectEnabled}
                    onChange={(e) => setPdDetectEnabled(e.target.checked)}
                  />
                  PD Detect (link liveness watchdog)
                </label>

                {pdDetectEnabled && (
                  <div className="space-y-3 pl-1">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                        Mode
                      </label>
                      <div className="flex gap-2">
                        {(["by-flow", "by-ping"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPdDetectMode(m)}
                            className={`px-3 py-1.5 text-sm rounded-lg border ${
                              pdDetectMode === m
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                            }`}
                          >
                            {m === "by-flow" ? "By Flow" : "By Ping"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {pdDetectMode === "by-ping" && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Peer IP address
                        </label>
                        <input
                          type="text"
                          value={pdDetectPeerIp}
                          onChange={(e) => setPdDetectPeerIp(e.target.value)}
                          placeholder="192.168.1.10"
                          className="w-full border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    )}

                    <div className="flex items-end gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Interval (5-60s)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={60}
                          value={pdDetectInterval}
                          onChange={(e) => setPdDetectInterval(e.target.value)}
                          className="w-28 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Times (3-30)
                        </label>
                        <input
                          type="number"
                          min={3}
                          max={30}
                          value={pdDetectTimes}
                          onChange={(e) => setPdDetectTimes(e.target.value)}
                          className="w-28 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
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

export default PoEConfiguration;
