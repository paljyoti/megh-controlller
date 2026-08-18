import type { CommandResponsePayload } from "../interfaces/mqttInterface.js";
declare const waitForResponse: (requestId: string, timeoutMs?: number) => Promise<CommandResponsePayload>;
declare const notifyResponse: (requestId: string, data: CommandResponsePayload) => void;
export { waitForResponse, notifyResponse };
//# sourceMappingURL=commandWaiter.d.ts.map