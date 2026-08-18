import { useState } from "react";
import { Settings } from "lucide-react";
import type { TelemetryData } from "../types/device";
import DeviceInfoTab from "../component/DeviceInfoTab";
import PortInfoTab from "../component/PortInfoTab";
import MacAddressTableTab from "../component/MacAddressTableTab";
import ProtocolStatusTab from "../component/ProtocolStatusTab";
import DeviceLogTab from "../component/DeviceLogTab";
import ConfigurationTab from "../component/config/ConfigurationTab";

type DetailTabKey = "device" | "port" | "mac" | "protocol" | "log" | "configuration";

const DETAIL_TABS: { key: DetailTabKey; label: string }[] = [
  { key: "device", label: "Device info" },
  { key: "port", label: "Port info" },
  { key: "mac", label: "Mac Address Table" },
  { key: "protocol", label: "Protocal Status" },
  { key: "log", label: "Device Log" },
  { key: "configuration", label: "Configuration" },
];

const SwitchDetailTabs = ({
  telemetry,
  deviceId,
}: {
  telemetry: TelemetryData | null;
  deviceId?: string;
}) => {
  const [activeTab, setActiveTab] = useState<DetailTabKey>("device");

  return (
    <div>
      <div className="flex items-center gap-6 border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-1 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {tab.key === "configuration" && <Settings size={15} />}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {activeTab === "device" && <DeviceInfoTab telemetry={telemetry} />}
        {activeTab === "port" && <PortInfoTab telemetry={telemetry} />}
        {activeTab === "mac" && <MacAddressTableTab />}
        {activeTab === "protocol" && <ProtocolStatusTab />}
        {activeTab === "log" && <DeviceLogTab />}
        {activeTab === "configuration" && <ConfigurationTab deviceId={deviceId} />}
      </div>
    </div>
  );
};

export default SwitchDetailTabs;
