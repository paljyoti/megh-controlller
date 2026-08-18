import { useState } from "react";
import VlanConfiguration from "./VlanConfiguration";

type ConfigSectionKey =
  | "vlan"
  | "dhcp"
  | "route"
  | "linkAgg"
  | "loopDetection"
  | "stp"
  | "portSecurity";

const CONFIG_SECTIONS: { key: ConfigSectionKey; label: string }[] = [
  { key: "vlan", label: "VLAN Configuration" },
  { key: "dhcp", label: "DHCP" },
  { key: "route", label: "Route Config" },
  { key: "linkAgg", label: "Link Aggregation" },
  { key: "loopDetection", label: "Loop Detection" },
  { key: "stp", label: "STP Configuration" },
  { key: "portSecurity", label: "Port Security" },
];

const ConfigurationTab = ({ deviceId }: { deviceId?: string }) => {
  const [configSection, setConfigSection] = useState<ConfigSectionKey>("vlan");

  return (
    <div className="flex flex-col md:flex-row rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
      {/* Config Sidebar */}
      <div className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-gray-100 dark:border-slate-700 py-2">
        {CONFIG_SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setConfigSection(s.key)}
            className={`w-full text-left px-4 py-2.5 text-sm border-l-2 transition-colors ${
              configSection === s.key
                ? "border-blue-600 text-blue-600 bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:bg-blue-900/20 font-medium"
                : "border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Config Content */}
      <div className="flex-1 p-5 min-w-0">
        {configSection === "vlan" ? (
          <VlanConfiguration deviceId={deviceId} />
        ) : (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {CONFIG_SECTIONS.find((s) => s.key === configSection)?.label} — Coming soon
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigurationTab;
