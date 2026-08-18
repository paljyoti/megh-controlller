import type { CommandMode } from "../interfaces/mqttInterface.js";
interface CommandSpec {
    command: string;
    mode: CommandMode;
}
interface DeviceCommandSet {
    vlan: {
        create: (vlanId: number) => CommandSpec;
        delete: (vlanId: number) => CommandSpec;
    };
    system: {
        showVersion: () => CommandSpec;
    };
}
export declare const getDeviceCommands: (model: string) => DeviceCommandSet;
export {};
//# sourceMappingURL=deviceCommands.d.ts.map