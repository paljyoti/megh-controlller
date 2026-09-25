import type { CommandSpec, InterfaceTarget } from "../types.js";

export interface LinkAggregationCommandParams {
  groupId: number;
  mode: "static" | "active" | "passive";
}

// Port Channel Configuration. setLoadBalance and setSystemPriority are flat global commands.
// assignPort/unassignPort use the Pre-command interface-context mechanism (one MQTT
// round-trip per member port — see linkAggregationController.ts).
export interface LinkAggregationCommandBuilder {
  setLoadBalance: (method: string) => CommandSpec;
  setSystemPriority: (priority: number) => CommandSpec;
  assignPort: (target: InterfaceTarget, params: LinkAggregationCommandParams) => CommandSpec;
  unassignPort: (target: InterfaceTarget) => CommandSpec;
}
