import { useEffect, useState, useCallback } from "react";
import { api } from "../../services/api";

interface PortRow {
  name: string;
  stpPriority: number;
  stpPathCost: number | null;
  stpEdgePort: "edgeport" | "autoedge" | null;
  stpBpduGuard: boolean;
  deviceConfirmed: boolean;
}

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
};

const STPConfiguration = ({ deviceId }: { deviceId?: string }) => {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"stp" | "rstp" | "mstp">("rstp");
  const [enabled, setEnabled] = useState(false);
  const [priority, setPriority] = useState("32768");
  const [helloTime, setHelloTime] = useState("2");
  const [forwardDelay, setForwardDelay] = useState("15");
  const [maxAge, setMaxAge] = useState("20");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");

  const [ports, setPorts] = useState<PortRow[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [portsError, setPortsError] = useState("");
  const [savingPort, setSavingPort] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!deviceId) return;
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const res = await api.getStpSettings(deviceId);
      const d = res.data.data;
      setSupported(d.supported);
      setMode(d.mode);
      setEnabled(d.enabled);
      setPriority(String(d.priority));
      setHelloTime(String(d.helloTime));
      setForwardDelay(String(d.forwardDelay));
      setMaxAge(String(d.maxAge));
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to load STP settings"));
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

  const handleSaveMode = async () => {
    if (!deviceId) return;
    setSavingField("mode");
    setSettingsError("");
    setSettingsSuccess("");
    try {
      await api.updateStpMode(deviceId, mode);
      setSettingsSuccess("STP mode updated — re-enable STP below, it resets on a mode change");
      await fetchSettings();
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to update STP mode"));
    } finally {
      setSavingField(null);
    }
  };

  const handleSaveEnabled = async () => {
    if (!deviceId) return;
    setSavingField("enabled");
    setSettingsError("");
    setSettingsSuccess("");
    try {
      await api.updateStpEnabled(deviceId, enabled);
      setSettingsSuccess("STP enabled setting updated");
      await fetchSettings();
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to update STP enabled setting"));
    } finally {
      setSavingField(null);
    }
  };

  const handleSaveTimers = async () => {
    if (!deviceId) return;
    const priorityNum = parseInt(priority, 10);
    const helloNum = parseInt(helloTime, 10);
    const forwardNum = parseInt(forwardDelay, 10);
    const maxAgeNum = parseInt(maxAge, 10);
    if (!(2 * (helloNum + 1) <= maxAgeNum && maxAgeNum <= 2 * (forwardNum - 1))) {
      setSettingsError(
        `Timers must satisfy 2*(helloTime+1) <= maxAge <= 2*(forwardDelay-1) — got hello=${helloNum}, forwardDelay=${forwardNum}, maxAge=${maxAgeNum}`
      );
      return;
    }
    setSavingField("timers");
    setSettingsError("");
    setSettingsSuccess("");
    try {
      await api.updateStpTimers(deviceId, {
        priority: priorityNum,
        helloTime: helloNum,
        forwardDelay: forwardNum,
        maxAge: maxAgeNum,
      });
      setSettingsSuccess("STP timers updated");
      await fetchSettings();
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to update STP timers"));
    } finally {
      setSavingField(null);
    }
  };

  const savePort = async (name: string, data: Partial<Pick<PortRow, "stpPriority" | "stpPathCost" | "stpEdgePort" | "stpBpduGuard">>) => {
    if (!deviceId) return;
    setSavingPort(name);
    setPortsError("");
    try {
      const res = await api.updatePort(deviceId, name, data);
      const updated = res.data.data.ports as PortRow[] | undefined;
      if (updated) {
        setPorts((cur) => {
          const byName = new Map(updated.map((p) => [p.name, p]));
          return cur.map((p) => (byName.has(p.name) ? { ...p, ...byName.get(p.name)! } : p));
        });
      }
    } catch (err) {
      setPortsError(extractErrorMessage(err, `Failed to update ${name}`));
    } finally {
      setSavingPort(null);
    }
  };

  if (!deviceId) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-gray-400 dark:text-gray-500 text-sm">No device selected</p>
      </div>
    );
  }

  if (settingsLoading && supported === null) {
    return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>;
  }

  if (supported === false) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          STP is not supported on this device model.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-lg mb-8">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Global Settings</h3>
        {settingsError && <p className="text-red-500 text-sm mb-3">{settingsError}</p>}
        {settingsSuccess && <p className="text-green-600 dark:text-green-400 text-sm mb-3">{settingsSuccess}</p>}

        <div className="grid grid-cols-[160px_1fr_auto] gap-x-3 gap-y-3 items-center">
          <label className="text-sm text-gray-600 dark:text-gray-300">Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="w-40 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          >
            <option value="stp">STP</option>
            <option value="rstp">RSTP</option>
            <option value="mstp">MSTP</option>
          </select>
          <button
            onClick={handleSaveMode}
            disabled={savingField === "mode"}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            Save
          </button>

          <label className="text-sm text-gray-600 dark:text-gray-300">Status</label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>
          <button
            onClick={handleSaveEnabled}
            disabled={savingField === "enabled"}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            Save
          </button>
        </div>

        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-6 mb-2">
          Election &amp; Timers
        </h4>
        <div className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-3 items-center mb-3">
          <label className="text-sm text-gray-600 dark:text-gray-300">Device Priority</label>
          <input
            type="number"
            min={0}
            max={61440}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-32 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          />
          <label className="text-sm text-gray-600 dark:text-gray-300">Hello Time (s)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={helloTime}
            onChange={(e) => setHelloTime(e.target.value)}
            className="w-32 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          />
          <label className="text-sm text-gray-600 dark:text-gray-300">Forward Delay (s)</label>
          <input
            type="number"
            min={4}
            max={30}
            value={forwardDelay}
            onChange={(e) => setForwardDelay(e.target.value)}
            className="w-32 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          />
          <label className="text-sm text-gray-600 dark:text-gray-300">Max Age (s)</label>
          <input
            type="number"
            min={6}
            max={40}
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
            className="w-32 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          Must satisfy: 2×(Hello + 1) ≤ Max Age ≤ 2×(Forward Delay − 1), or the switch may see
          unstable topology.
        </p>
        <div className="flex justify-end">
          <button
            onClick={handleSaveTimers}
            disabled={savingField === "timers"}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {savingField === "timers" ? "Saving..." : "Save Timers"}
          </button>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Per-Port Settings</h3>
      {portsError && <p className="text-red-500 text-sm mb-3">{portsError}</p>}
      {portsLoading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading ports...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-3 font-medium">Port</th>
                <th className="py-2 pr-3 font-medium">Priority</th>
                <th className="py-2 pr-3 font-medium">Path Cost</th>
                <th className="py-2 pr-3 font-medium">Edge Mode</th>
                <th className="py-2 pr-3 font-medium">BPDU Guard</th>
                <th className="py-2 pr-3 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {ports.map((p) => {
                const isSaving = savingPort === p.name;
                return (
                  <tr key={p.name} className="border-b border-gray-100 dark:border-slate-700/60">
                    <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-100">{p.name}</td>
                    <td className="py-2.5 pr-3">
                      <input
                        type="number"
                        min={0}
                        max={240}
                        defaultValue={p.stpPriority}
                        disabled={isSaving}
                        onBlur={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v) && v !== p.stpPriority) savePort(p.name, { stpPriority: v });
                        }}
                        className="w-20 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        type="number"
                        min={1}
                        max={200000000}
                        placeholder="auto"
                        defaultValue={p.stpPathCost ?? ""}
                        disabled={isSaving}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const v = raw === "" ? null : parseInt(raw, 10);
                          if (v !== p.stpPathCost) savePort(p.name, { stpPathCost: v });
                        }}
                        className="w-28 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <select
                        value={p.stpEdgePort ?? ""}
                        disabled={isSaving}
                        onChange={(e) =>
                          savePort(p.name, { stpEdgePort: (e.target.value || null) as "edgeport" | "autoedge" | null })
                        }
                        className="border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                      >
                        <option value="">none</option>
                        <option value="edgeport">edgeport</option>
                        <option value="autoedge">autoedge</option>
                      </select>
                    </td>
                    <td className="py-2.5 pr-3">
                      <button
                        role="switch"
                        aria-checked={p.stpBpduGuard}
                        disabled={isSaving}
                        onClick={() => savePort(p.name, { stpBpduGuard: !p.stpBpduGuard })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                          p.stpBpduGuard ? "bg-green-500" : "bg-gray-300 dark:bg-slate-600"
                        }`}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                          style={{ transform: p.stpBpduGuard ? "translateX(18px)" : "translateX(2px)" }}
                        />
                      </button>
                    </td>
                    <td className="py-2.5 pr-3">
                      {p.deviceConfirmed ? (
                        <span className="text-xs text-green-600 dark:text-green-400">confirmed</span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400">not confirmed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {ports.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-400 dark:text-gray-500">
                    No ports reported by this device yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default STPConfiguration;
