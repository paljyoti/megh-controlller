import type { CommandSpec, InterfaceTarget } from "../types.js";
export interface StpCommandBuilder {
    setMode: (mode: "stp" | "rstp" | "mstp") => CommandSpec;
    setEnabled: (enabled: boolean) => CommandSpec;
    setPriority: (priority: number) => CommandSpec;
    setHelloTime: (seconds: number) => CommandSpec;
    setForwardDelay: (seconds: number) => CommandSpec;
    setMaxAge: (seconds: number) => CommandSpec;
    setPortPriority: (target: InterfaceTarget, priority: number) => CommandSpec;
    setPortPathCost: (target: InterfaceTarget, cost: number | null) => CommandSpec;
    setPortEdgeMode: (target: InterfaceTarget, mode: "edgeport" | "autoedge" | null, previous: "edgeport" | "autoedge" | null) => CommandSpec;
    setPortBpduGuard: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map