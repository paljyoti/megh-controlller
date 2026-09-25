import type { CommandSpec, InterfaceTarget } from "../types.js";
export interface PoeCommandBuilder {
    setPowerSupply: (watts: number) => CommandSpec;
    clearPowerSupply: () => CommandSpec;
    setLegacyMode?: (on: boolean) => CommandSpec;
    setPortEnabled: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
    setPowerAlarm?: (percent: number | null) => CommandSpec;
    setPowerReserved?: (percent: number) => CommandSpec;
    setPortForceOn?: (target: InterfaceTarget) => CommandSpec;
    clearPortForce?: (target: InterfaceTarget) => CommandSpec;
    setPortPriority?: (target: InterfaceTarget, priority: "low" | "medium" | "high") => CommandSpec;
    setPortMaxPower?: (target: InterfaceTarget, watts: number | null) => CommandSpec;
    setPortLegacyMode?: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
    setPortPdDescription?: (target: InterfaceTarget, description: string | null) => CommandSpec;
    setPortPdDetectByFlow?: (target: InterfaceTarget) => CommandSpec;
    setPortPdDetectByPing?: (target: InterfaceTarget, peerIp: string) => CommandSpec;
    clearPortPdDetectMode?: (target: InterfaceTarget) => CommandSpec;
    setPortPdDetectParams?: (target: InterfaceTarget, intervalSeconds: number, times: number) => CommandSpec;
    clearPortPdDetectParams?: (target: InterfaceTarget) => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map