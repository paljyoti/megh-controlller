import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { api, canSendCommands } from "../services/api";
import type { DeviceInfo, TelemetryData, StatusData } from "../types/device";
import SwitchDetailTabs from "./SwitchDetailTabs";

function InfoRow({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <span className="h-4 w-1 rounded-full bg-indigo-500 dark:bg-indigo-400" />
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <span className={`text-sm font-semibold text-gray-900 dark:text-gray-100 text-right ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}

const SwitchDetails = () => {
  const { switchId } = useParams();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [command, setCommand] = useState("");
  const [commandResult, setCommandResult] = useState("");

  useEffect(() => {
    if (!switchId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [devRes, telRes, statRes] = await Promise.allSettled([
          api.getAllDevices(),
          api.getDeviceTelemetry(switchId),
          api.getDeviceStatus(switchId),
        ]);

        if (devRes.status === "fulfilled") {
          const found = devRes.value.data.data.devices.find(
            (d: DeviceInfo) => d.id === switchId
          );
          if (found) setDevice(found);
        }
        if (telRes.status === "fulfilled") {
          setTelemetry(telRes.value.data.data.telemetry);
        }
        if (statRes.status === "fulfilled") {
          setStatusData(statRes.value.data.data);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [switchId]);

  const handleSendCommand = async () => {
    if (!switchId || !command.trim()) return;
    try {
      const res = await api.sendCommand(switchId, command.trim());
      setCommandResult(`Command sent. Request ID: ${res.data.data.requestId}`);
      setCommand("");
    } catch {
      setCommandResult("Failed to send command");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const uptimeStr = statusData?.latestRecord?.uptime
    ? formatUptime(parseInt(statusData.latestRecord.uptime))
    : "-";

  return (
    <div className="space-y-6">
      {/* System Information */}
      <div>
        <h2 className="text-gray-900 dark:text-gray-100 font-bold text-base mb-2">
          System Information
        </h2>

        <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
              <InfoRow label="Product ID" value={device?.model || "-"} />
              <InfoRow
                label="Software Version"
                value={device?.softwareVersion || "-"}
                valueClassName="text-indigo-600 dark:text-indigo-400"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
              <InfoRow label="Product SN" value={device?.serialNumber || "-"} />
              <InfoRow label="Uptime" value={uptimeStr} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
              <InfoRow label="MAC Address" value={device?.macAddress || "-"} />
              <InfoRow
                label="Status"
                value={statusData?.currentStatus || device?.status || "-"}
                valueClassName="capitalize"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
              <InfoRow label="Hardware Version" value={device?.hardwareVersion || "-"} />
              <InfoRow label="IP Address" value={device?.ipAddress || "-"} />
            </div>
          </div>
        </div>
      </div>

      {/* Detail Tabs: Device info / Port info / Mac Address Table / Protocal Status / Device Log / Configuration */}
      <SwitchDetailTabs telemetry={telemetry} deviceId={switchId} />

      {/* Command Section - only for ADMIN/SUPERADMIN */}
      {canSendCommands() && (
        <>
          <hr className="border-gray-200 dark:border-slate-700" />
          <div>
            <h2 className="text-blue-700 dark:text-blue-400 font-bold text-base mb-4">
              Send Command
            </h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Enter command..."
                className="flex-1 border border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSendCommand}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                Send
              </button>
            </div>
            {commandResult && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{commandResult}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export default SwitchDetails;
