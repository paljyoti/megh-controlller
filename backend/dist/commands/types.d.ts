import type { CommandMode } from "../interfaces/mqttInterface.js";
export interface CommandSpec {
    command: string;
    mode: CommandMode;
    params?: Record<string, unknown>;
}
export type InterfaceTarget = {
    kind: "single";
    port: string;
} | {
    kind: "range";
    rangeSpec: string;
} | {
    kind: "svi";
    vlanId: number;
};
export declare const buildInterfaceCommand: (target: InterfaceTarget, subcommand: string) => CommandSpec;
//# sourceMappingURL=types.d.ts.map