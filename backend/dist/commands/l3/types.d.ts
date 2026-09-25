import type { CommandSpec, InterfaceTarget } from "../types.js";
export interface L3CommandBuilder {
    setRoutedMode: (target: InterfaceTarget) => CommandSpec;
    clearRoutedMode: (target: InterfaceTarget) => CommandSpec;
    setIpv4: (target: InterfaceTarget, addr: string) => CommandSpec;
    clearIpv4: (target: InterfaceTarget, addr: string) => CommandSpec;
    setIpv6: (target: InterfaceTarget, addr: string) => CommandSpec;
    clearIpv6: (target: InterfaceTarget, addr: string) => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map