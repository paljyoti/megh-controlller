import type { CommandSpec, InterfaceTarget } from "../types.js";
export interface PortSecurityCommandBuilder {
    validateMac: (macAddress: string) => boolean;
    macFormatHint: string;
    setPortSecurityEnabled?: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
    setPortSecurityAgingStatic?: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
    setPortSecurityAgingTime?: (target: InterfaceTarget, minutes: number | null) => CommandSpec;
    setPortSecurityStickyMac?: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
    setPortSecurityMaximum?: (target: InterfaceTarget, max: number | null) => CommandSpec;
    setPortSecurityViolation?: (target: InterfaceTarget, mode: "restrict" | "shutdown" | null) => CommandSpec;
    bindStaticMac?: (target: InterfaceTarget, macAddress: string, sticky: boolean) => CommandSpec;
    unbindStaticMac?: (target: InterfaceTarget, macAddress: string) => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map