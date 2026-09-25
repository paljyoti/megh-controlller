import type { CommandSpec } from "../types.js";
export interface SystemCommandBuilder {
    showVersion: () => CommandSpec;
    setHostname: (name: string) => CommandSpec;
    clearHostname: () => CommandSpec;
    setNtpServer: (ipv4: string) => CommandSpec;
    setTimezone: (zone: string) => CommandSpec;
    setWebServer: (mode: "all" | "http" | "https" | null) => CommandSpec;
    setTelnetServer: (enabled: boolean) => CommandSpec;
    setSshServer: (enabled: boolean) => CommandSpec;
    setManagementIpStatic: (vlanId: number, cidr: string, gateway: string) => CommandSpec;
    setManagementIpDhcp: (vlanId: number) => CommandSpec;
    clearManagementIp: () => CommandSpec;
    setManagementIpv6Static: (vlanId: number, cidr: string, gateway: string) => CommandSpec;
    setManagementIpv6Dhcp: (vlanId: number) => CommandSpec;
    writeConfig: () => CommandSpec;
    reload: () => CommandSpec;
    factoryRestoreConfig: () => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map