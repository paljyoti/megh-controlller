import type { CommandSpec, InterfaceTarget } from "../types.js";
export interface LoopDetectCommandBuilder {
    setGlobalEnabled: (enabled: boolean) => CommandSpec;
    setPortEnabled: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
    setPortAction: (target: InterfaceTarget, action: "alarm" | "error-down") => CommandSpec;
    setPortVlans: (target: InterfaceTarget, vlanSpec: string | null) => CommandSpec;
    setInterval: (seconds: number) => CommandSpec;
    setErrdisableTimeoutEnabled: (enabled: boolean) => CommandSpec;
    setErrdisableTimeoutInterval: (seconds: number) => CommandSpec;
    recoverErrdisablePort: (port: string) => CommandSpec;
    setTrapEnabled: (enabled: boolean) => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map