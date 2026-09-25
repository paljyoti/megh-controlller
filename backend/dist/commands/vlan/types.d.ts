import type { CommandSpec } from "../types.js";
export interface VlanCommandBuilder {
    create: (vlanIdOrRange: number | string) => CommandSpec;
    delete: (vlanIdOrRange: number | string) => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map