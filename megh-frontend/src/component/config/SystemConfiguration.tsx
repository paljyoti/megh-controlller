import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Save, Power, RotateCcw } from "lucide-react";
import { api } from "../../services/api";

type WebServerMode = "all" | "http" | "https" | null;

interface SystemSettings {
  hostname: string | null;
  ntpServer: string | null;
  timezone: string | null;
  webServerMode: WebServerMode;
  telnetServerEnabled: boolean;
  sshServerEnabled: boolean;
  managementVlanId: number | null;
  managementIpMode: "static" | "dhcp" | null;
  managementIp: string | null;
  managementGateway: string | null;
  managementIpv6Mode: "static" | "dhcp" | null;
  managementIpv6: string | null;
  managementIpv6Gateway: string | null;
  configSaved: boolean;
}

const extractErrorMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
};

const SystemConfiguration = ({ deviceId }: { deviceId?: string }) => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [hostname, setHostname] = useState("");
  const [ntpServer, setNtpServer] = useState("");
  const [timezone, setTimezone] = useState("");
  const [webServerMode, setWebServerMode] = useState<"disabled" | "all" | "http" | "https">("disabled");
  const [telnetEnabled, setTelnetEnabled] = useState(false);
  const [sshEnabled, setSshEnabled] = useState(false);

  const [savingField, setSavingField] = useState<string | null>(null);

  // Management IP — most sensitive form, kept separate with its own confirm state.
  const [mgmtProtocol, setMgmtProtocol] = useState<"ipv4" | "ipv6">("ipv4");
  const [mgmtVlanId, setMgmtVlanId] = useState("");
  const [mgmtMode, setMgmtMode] = useState<"static" | "dhcp">("static");
  const [mgmtIp, setMgmtIp] = useState("");
  const [mgmtGateway, setMgmtGateway] = useState("");
  const [mgmtIpv6Mode, setMgmtIpv6Mode] = useState<"static" | "dhcp">("static");
  const [mgmtIpv6, setMgmtIpv6] = useState("");
  const [mgmtIpv6Gateway, setMgmtIpv6Gateway] = useState("");
  const [mgmtConfirm, setMgmtConfirm] = useState(false);
  const [mgmtSaving, setMgmtSaving] = useState(false);

  const [writeSaving, setWriteSaving] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [reloadSaving, setReloadSaving] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreSaving, setRestoreSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.getSystemSettings(deviceId);
      const s = res.data.data as SystemSettings;
      setSettings(s);
      setHostname(s.hostname ?? "");
      setNtpServer(s.ntpServer ?? "");
      setTimezone(s.timezone ?? "");
      setWebServerMode(s.webServerMode ?? "disabled");
      setTelnetEnabled(s.telnetServerEnabled);
      setSshEnabled(s.sshServerEnabled);
      if (s.managementVlanId) setMgmtVlanId(String(s.managementVlanId));
      if (s.managementIpMode) setMgmtMode(s.managementIpMode);
      if (s.managementIp) setMgmtIp(s.managementIp);
      if (s.managementGateway) setMgmtGateway(s.managementGateway);
      if (s.managementIpv6Mode) setMgmtIpv6Mode(s.managementIpv6Mode);
      if (s.managementIpv6) setMgmtIpv6(s.managementIpv6);
      if (s.managementIpv6Gateway) setMgmtIpv6Gateway(s.managementIpv6Gateway);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load system settings"));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const runField = async (field: string, action: () => Promise<unknown>) => {
    if (!deviceId) return;
    setSavingField(field);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(`${field} updated`);
      await fetchSettings();
    } catch (err) {
      setError(extractErrorMessage(err, `Failed to update ${field}`));
    } finally {
      setSavingField(null);
    }
  };

  const handleSaveManagementIp = async () => {
    if (!deviceId) return;
    const vlanId = parseInt(mgmtVlanId, 10);
    if (!mgmtVlanId || Number.isNaN(vlanId) || vlanId < 1 || vlanId > 4094) {
      setError("Enter a valid management VLAN ID (1-4094)");
      return;
    }

    const isV4 = mgmtProtocol === "ipv4";
    const mode = isV4 ? mgmtMode : mgmtIpv6Mode;
    const ip = isV4 ? mgmtIp : mgmtIpv6;
    const gateway = isV4 ? mgmtGateway : mgmtIpv6Gateway;

    if (mode === "static" && (!ip.trim() || !gateway.trim())) {
      setError("Static mode requires both an IP/mask and a gateway");
      return;
    }
    if (!mgmtConfirm) {
      setError("Check the confirmation box — this can disconnect the platform from the device");
      return;
    }
    setMgmtSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        vlanId,
        mode,
        ...(mode === "static" ? { ip: ip.trim(), gateway: gateway.trim() } : {}),
        confirm: true as const,
      };
      if (isV4) await api.updateManagementIp(deviceId, payload);
      else await api.updateManagementIpv6(deviceId, payload);
      setSuccess(`Management ${isV4 ? "IPv4" : "IPv6"} updated`);
      setMgmtConfirm(false);
      await fetchSettings();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update management IP"));
    } finally {
      setMgmtSaving(false);
    }
  };

  const handleWrite = async () => {
    if (!deviceId) return;
    setWriteSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.writeConfig(deviceId);
      setSuccess("Configuration saved — will survive a reboot");
      await fetchSettings();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to save configuration"));
    } finally {
      setWriteSaving(false);
    }
  };

  const handleReload = async () => {
    if (!deviceId || !reloadConfirm) return;
    setReloadSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.reloadDevice(deviceId);
      setSuccess("Reload initiated — the device is rebooting");
      setReloadConfirm(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to reload device"));
    } finally {
      setReloadSaving(false);
    }
  };

  const handleFactoryRestore = async () => {
    if (!deviceId || !restoreConfirm) return;
    setRestoreSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.factoryRestore(deviceId);
      setSuccess("Factory restore initiated — the device is reloading with default configuration");
      setRestoreConfirm(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to factory-restore device"));
    } finally {
      setRestoreSaving(false);
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
    <div className="max-w-lg space-y-8">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {success && <p className="text-green-600 dark:text-green-400 text-sm">{success}</p>}

      {loading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : (
        <>
          {settings && !settings.configSaved && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle size={15} className="shrink-0" />
              There are changes made from this System page that haven't been saved with{" "}
              <strong>Write Configuration</strong> below — they'll be lost on reboot. (This
              indicator only tracks changes made here, not other config tabs.)
            </div>
          )}

          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Identity</h3>
            <div className="grid grid-cols-[140px_1fr_auto] gap-x-3 gap-y-3 items-center">
              <label className="text-sm text-gray-600 dark:text-gray-300">Hostname</label>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
              />
              <button
                onClick={() => runField("hostname", () => api.updateHostname(deviceId, hostname.trim() || null))}
                disabled={savingField === "hostname"}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Date &amp; Time</h3>
            <div className="grid grid-cols-[140px_1fr_auto] gap-x-3 gap-y-3 items-center">
              <label className="text-sm text-gray-600 dark:text-gray-300">NTP Server</label>
              <input
                type="text"
                value={ntpServer}
                onChange={(e) => setNtpServer(e.target.value)}
                placeholder="A.B.C.D (IPv4 only)"
                className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
              />
              <button
                onClick={() => runField("NTP server", () => api.updateNtpServer(deviceId, ntpServer.trim()))}
                disabled={savingField === "NTP server"}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                Save
              </button>

              <label className="text-sm text-gray-600 dark:text-gray-300">Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. Shanghai, Hong_Kong, UTC"
                className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
              />
              <button
                onClick={() => runField("timezone", () => api.updateTimezone(deviceId, timezone.trim()))}
                disabled={savingField === "timezone"}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Management Access</h3>
            <div className="grid grid-cols-[140px_1fr_auto] gap-x-3 gap-y-3 items-center">
              <label className="text-sm text-gray-600 dark:text-gray-300">Web Server</label>
              <select
                value={webServerMode}
                onChange={(e) => setWebServerMode(e.target.value as typeof webServerMode)}
                className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
              >
                <option value="disabled">Disabled</option>
                <option value="all">All (HTTP + HTTPS)</option>
                <option value="http">HTTP only</option>
                <option value="https">HTTPS only</option>
              </select>
              <button
                onClick={() =>
                  runField("web server", () => api.updateWebServer(deviceId, webServerMode === "disabled" ? null : webServerMode))
                }
                disabled={savingField === "web server"}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                Save
              </button>

              <label className="text-sm text-gray-600 dark:text-gray-300">Telnet Server</label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={telnetEnabled} onChange={(e) => setTelnetEnabled(e.target.checked)} />
                Enabled
              </label>
              <button
                onClick={() => runField("telnet server", () => api.updateTelnetServer(deviceId, telnetEnabled))}
                disabled={savingField === "telnet server"}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                Save
              </button>

              <label className="text-sm text-gray-600 dark:text-gray-300">SSH Server</label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={sshEnabled} onChange={(e) => setSshEnabled(e.target.checked)} />
                Enabled
              </label>
              <button
                onClick={() => runField("SSH server", () => api.updateSshServer(deviceId, sshEnabled))}
                disabled={savingField === "SSH server"}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Management IP</h3>
            <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                This is the most sensitive setting on this page — a mistake here can disconnect
                the platform from this switch entirely. Double-check the VLAN and address before
                confirming.
              </p>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-3 items-center mb-3">
              <label className="text-sm text-gray-600 dark:text-gray-300">Protocol</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                  <input type="radio" checked={mgmtProtocol === "ipv4"} onChange={() => setMgmtProtocol("ipv4")} />
                  IPv4
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                  <input type="radio" checked={mgmtProtocol === "ipv6"} onChange={() => setMgmtProtocol("ipv6")} />
                  IPv6
                </label>
              </div>
              <label className="text-sm text-gray-600 dark:text-gray-300">Management VLAN</label>
              <input
                type="number"
                value={mgmtVlanId}
                onChange={(e) => setMgmtVlanId(e.target.value)}
                className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
              />
              <label className="text-sm text-gray-600 dark:text-gray-300">Mode</label>
              {mgmtProtocol === "ipv4" ? (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                    <input type="radio" checked={mgmtMode === "static"} onChange={() => setMgmtMode("static")} />
                    Static
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                    <input type="radio" checked={mgmtMode === "dhcp"} onChange={() => setMgmtMode("dhcp")} />
                    DHCP
                  </label>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                    <input type="radio" checked={mgmtIpv6Mode === "static"} onChange={() => setMgmtIpv6Mode("static")} />
                    Static
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                    <input type="radio" checked={mgmtIpv6Mode === "dhcp"} onChange={() => setMgmtIpv6Mode("dhcp")} />
                    DHCP
                  </label>
                </div>
              )}
              {mgmtProtocol === "ipv4" && mgmtMode === "static" && (
                <>
                  <label className="text-sm text-gray-600 dark:text-gray-300">IP Address</label>
                  <input
                    type="text"
                    value={mgmtIp}
                    onChange={(e) => setMgmtIp(e.target.value)}
                    placeholder="192.168.1.10/24"
                    className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  />
                  <label className="text-sm text-gray-600 dark:text-gray-300">Gateway</label>
                  <input
                    type="text"
                    value={mgmtGateway}
                    onChange={(e) => setMgmtGateway(e.target.value)}
                    placeholder="192.168.1.1"
                    className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  />
                </>
              )}
              {mgmtProtocol === "ipv6" && mgmtIpv6Mode === "static" && (
                <>
                  <label className="text-sm text-gray-600 dark:text-gray-300">IP Address</label>
                  <input
                    type="text"
                    value={mgmtIpv6}
                    onChange={(e) => setMgmtIpv6(e.target.value)}
                    placeholder="2001:db8::10/64"
                    className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  />
                  <label className="text-sm text-gray-600 dark:text-gray-300">Gateway</label>
                  <input
                    type="text"
                    value={mgmtIpv6Gateway}
                    onChange={(e) => setMgmtIpv6Gateway(e.target.value)}
                    placeholder="2001:db8::1"
                    className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                  />
                </>
              )}
            </div>
            <label className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 mb-3">
              <input type="checkbox" checked={mgmtConfirm} onChange={(e) => setMgmtConfirm(e.target.checked)} className="mt-0.5" />
              I understand this can disconnect the platform from the device if misconfigured.
            </label>
            <div className="flex justify-end">
              <button
                onClick={handleSaveManagementIp}
                disabled={mgmtSaving || !mgmtConfirm}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {mgmtSaving ? "Saving..." : "Save Management IP"}
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Configuration &amp; Reboot</h3>

            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-slate-700 mb-3">
              <div>
                <p className="text-sm text-gray-800 dark:text-gray-100 font-medium">Write Configuration</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Persists the running config so it survives a reboot.</p>
              </div>
              <button
                onClick={handleWrite}
                disabled={writeSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                <Save size={14} /> {writeSaving ? "Saving..." : "Write"}
              </button>
            </div>

            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-100 font-medium">Reload Device</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Reboots the switch now. Unsaved changes will be lost.</p>
                </div>
                <button
                  onClick={handleReload}
                  disabled={reloadSaving || !reloadConfirm}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  <RotateCcw size={14} /> {reloadSaving ? "Reloading..." : "Reload"}
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                <input type="checkbox" checked={reloadConfirm} onChange={(e) => setReloadConfirm(e.target.checked)} />
                I understand this reboots the device now.
              </label>
            </div>

            <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-100 font-medium">Factory Restore</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Wipes VLANs, ports, and all configuration back to factory defaults, then reboots.
                  </p>
                </div>
                <button
                  onClick={handleFactoryRestore}
                  disabled={restoreSaving || !restoreConfirm}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <Power size={14} /> {restoreSaving ? "Restoring..." : "Factory Restore"}
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                <input type="checkbox" checked={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.checked)} />
                I understand this permanently erases the device's configuration.
              </label>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default SystemConfiguration;
