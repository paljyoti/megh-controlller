import { buildInterfaceCommand } from "../types.js";
export const linkAggregationAc5 = {
    setLoadBalance: (method) => ({ command: `port-channel load-balance ${method}`, mode: "config" }),
    // CLI ref: "Configuring LACP System Priority" — SWITCH(config)# lacp system-priority SYSTEM-PRIORITY
    setSystemPriority: (priority) => ({ command: `lacp system-priority ${priority}`, mode: "config" }),
    // CLI ref: "Configuring Layer 2 Channels" — SWITCH(config-if)# channel-group ID mode manual / {active|passive}
    assignPort: (target, { groupId, mode }) => buildInterfaceCommand(target, `channel-group ${groupId} mode ${mode === "static" ? "manual" : mode}`),
    unassignPort: (target) => buildInterfaceCommand(target, "no channel-group"),
};
//# sourceMappingURL=ac5.js.map