import type { CommandSpec, InterfaceTarget } from "../types.js";
export interface LinkAggregationCommandParams {
    groupId: number;
    mode: "static" | "active" | "passive";
}
export interface LinkAggregationCommandBuilder {
    setLoadBalance: (method: string) => CommandSpec;
    setSystemPriority: (priority: number) => CommandSpec;
    assignPort: (target: InterfaceTarget, params: LinkAggregationCommandParams) => CommandSpec;
    unassignPort: (target: InterfaceTarget) => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map