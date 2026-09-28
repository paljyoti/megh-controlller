import { useEffect, useState, useCallback } from "react";
import { api } from "../../services/api";

interface PortRow {
  name: string;
  loopDetectEnabled: boolean;
  loopDetectAction: "alarm" | "error-down";
  loopDetectVlans: string | null;
  deviceConfirmed: boolean;
}

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
};

const LoopDetectionConfiguration = ({ deviceId }: { deviceId?: string }) => {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [interval, setIntervalSec] = useState("5");
  const [errdisableEnabled, setErrdisableEnabled] = useState(false);
  const [errdisableInterval, setErrdisableInterval] = useState("300");
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
      const res = await api.getLoopDetectSettings(deviceId);
      const d = res.data.data;
      setSupported(d.supported);
      setEnabled(d.enabled);
      setIntervalSec(String(d.interval));
      setErrdisableEnabled(d.errdisableTimeoutEnabled);
      setErrdisableInterval(String(d.errdisableTimeoutInterval));
    } catch (err) {
      setSettingsError(extractErrorMessage(err, "Failed to load Loop-Detect settings"));
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

  const runField = async (field: string, action: () => Promise<unknown>) => {
    if (!deviceId) return;
    setSavingField(field);
    setSettingsError("");
    setSettingsSuccess("");
    try {
      await action();
      setSettingsSuccess(`${field} updated`);
      await fetchSettings();
    } catch (err) {
      setSettingsError(extractErrorMessage(err, `Failed to update ${field}`));
    } finally {
      setSavingField(null);
    }
  };

  const savePort = async (name: string, data: Partial<Pick<PortRow, "loopDetectEnabled" | "loopDetectAction" | "loopDetectVlans">>) => {
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
          Loop-Detect is not supported on this device model.
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
          <label className="text-sm text-gray-600 dark:text-gray-300">Loop-Detect</label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled globally
          </label>
          <button
            onClick={() => runField("Loop-Detect", () => api.updateLoopDetectGlobal(deviceId, enabled))}
            disabled={savingField === "Loop-Detect"}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            Save
          </button>

          <label className="text-sm text-gray-600 dark:text-gray-300">Send Interval (s)</label>
          <input
            type="number"
            min={5}
            max={300}
            value={interval}
            onChange={(e) => setIntervalSec(e.target.value)}
            className="w-32 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={() =>
              runField("interval", () => api.updateLoopDetectInterval(deviceId, parseInt(interval, 10)))
            }
            disabled={savingField === "interval"}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            Save
          </button>

          <label className="text-sm text-gray-600 dark:text-gray-300">Errdisable Recovery</label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={errdisableEnabled} onChange={(e) => setErrdisableEnabled(e.target.checked)} />
              Enabled, after
            </label>
            <input
              type="number"
              min={10}
              max={1000000}
              value={errdisableInterval}
              onChange={(e) => setErrdisableInterval(e.target.value)}
              disabled={!errdisableEnabled}
              className="w-28 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">sec</span>
          </div>
          <button
            onClick={() =>
              runField("errdisable timeout", () =>
                api.updateErrdisableTimeout(deviceId, errdisableEnabled, errdisableEnabled ? parseInt(errdisableInterval, 10) : undefined)
              )
            }
            disabled={savingField === "errdisable timeout"}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            Save
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Errdisable recovery is shared with every other errdisable-triggering feature on the
          device — this isn't Loop-Detect specific.
        </p>
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
                <th className="py-2 pr-3 font-medium">Enabled</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">VLAN Scope</th>
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
                      <button
                        role="switch"
                        aria-checked={p.loopDetectEnabled}
                        disabled={isSaving}
                        onClick={() => savePort(p.name, { loopDetectEnabled: !p.loopDetectEnabled })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                          p.loopDetectEnabled ? "bg-green-500" : "bg-gray-300 dark:bg-slate-600"
                        }`}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                          style={{ transform: p.loopDetectEnabled ? "translateX(18px)" : "translateX(2px)" }}
                        />
                      </button>
                    </td>
                    <td className="py-2.5 pr-3">
                      <select
                        value={p.loopDetectAction}
                        disabled={isSaving}
                        onChange={(e) => savePort(p.name, { loopDetectAction: e.target.value as "alarm" | "error-down" })}
                        className="border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                      >
                        <option value="alarm">alarm</option>
                        <option value="error-down">error-down</option>
                      </select>
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        type="text"
                        defaultValue={p.loopDetectVlans ?? ""}
                        placeholder="all"
                        disabled={isSaving}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (p.loopDetectVlans ?? "")) savePort(p.name, { loopDetectVlans: v || null });
                        }}
                        className="w-28 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                      />
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
                  <td colSpan={5} className="py-4 text-center text-gray-400 dark:text-gray-500">
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

export default LoopDetectionConfiguration;
