import type { CommandSpec } from "../types.js";
export interface TopologyCommandBuilder {
    showMacTable: () => CommandSpec;
    showLldpNeighbor: (port: string) => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map