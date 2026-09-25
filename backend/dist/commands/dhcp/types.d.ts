import type { CommandSpec } from "../types.js";
export interface DhcpPoolCommandParams {
    poolName: string;
    network: string;
    netmask: string;
    gateway: string;
    leasePeriod: string;
    leaseDays?: number | null;
    leaseHours?: number | null;
    leaseMinutes?: number | null;
    dns: string;
    backupDns?: string | null;
    option43?: string | null;
    addressSegments: {
        start: string;
        end: string;
    }[];
}
export interface DhcpCommandBuilder {
    create: (params: DhcpPoolCommandParams) => CommandSpec;
    delete: (poolName: string) => CommandSpec;
    setStatus: (poolName: string, status: "enabled" | "disabled") => CommandSpec;
    setNakStatus: (poolName: string, nakStatus: "enabled" | "disabled") => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map