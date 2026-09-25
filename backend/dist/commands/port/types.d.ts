import type { CommandSpec, InterfaceTarget } from "../types.js";
export interface PortCommandBuilder {
    setDescription: (target: InterfaceTarget, description: string) => CommandSpec;
    setAdminStatus: (target: InterfaceTarget, status: "up" | "down") => CommandSpec;
    setSpeed: (target: InterfaceTarget, speed: string) => CommandSpec;
    setDuplex: (target: InterfaceTarget, duplex: string) => CommandSpec;
    setFlowControl: (target: InterfaceTarget, flowControl: "on" | "off") => CommandSpec;
    setMtu: (target: InterfaceTarget, mtu: number) => CommandSpec;
    setMedium: (target: InterfaceTarget, medium: "copper" | "fiber") => CommandSpec;
    setSfpMode: (target: InterfaceTarget, sfpMode: string) => CommandSpec;
    setAutoneg: (target: InterfaceTarget, autoneg: "on" | "off") => CommandSpec;
    setSwitchportMode: (target: InterfaceTarget, mode: "access" | "trunk" | "hybrid") => CommandSpec;
    setAccessVlan: (target: InterfaceTarget, vlanId: number) => CommandSpec;
    setTrunkAllowedVlan: (target: InterfaceTarget, vlanList: string) => CommandSpec;
    setTrunkNativeVlan: (target: InterfaceTarget, vlanId: number) => CommandSpec;
    setHybridAllowedVlan: (target: InterfaceTarget, vlanList: string) => CommandSpec;
    setHybridVlan: (target: InterfaceTarget, vlanId: number) => CommandSpec;
    setHybridUntaggedVlan: (target: InterfaceTarget, vlanList: string) => CommandSpec;
    clearHybridUntaggedVlan: (target: InterfaceTarget, vlanList: string) => CommandSpec;
    setLacpPortPriority: (target: InterfaceTarget, priority: number) => CommandSpec;
    setLacpTimeout: (target: InterfaceTarget, timeout: "long" | "short") => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map