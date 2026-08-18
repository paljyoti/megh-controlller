import type { CommandMode, CommandResponsePayload } from "../interfaces/mqttInterface.js";
type DeviceRef = {
    id: string;
    serialNumber: string;
};
interface CommandInput {
    command: string;
    mode: CommandMode;
    params?: Record<string, unknown>;
    logParams?: Record<string, unknown>;
}
export declare const publishCommand: (device: DeviceRef, input: CommandInput) => Promise<{
    requestId: string;
    commandLogId: string;
}>;
export declare class CommandTimeoutError extends Error {
    requestId: string;
    constructor(requestId: string);
}
export declare const runDeviceCommand: (device: DeviceRef, input: CommandInput, timeoutMs?: number) => Promise<{
    requestId: string;
    commandLogId: string;
    response: CommandResponsePayload;
}>;
export {};
//# sourceMappingURL=deviceCommand.d.ts.map