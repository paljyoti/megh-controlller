import { v4 as uuidv4 } from "uuid";
import mqttClient from "../config/mqttConfig.js";
import prisma from "../db/client.js";
import type { CommandMode, CommandRequestPayload, CommandResponsePayload } from "../interfaces/mqttInterface.js";
import { waitForResponse } from "./commandWaiter.js";

// Only id/serialNumber are needed, so callers can pass a full Prisma Device or a narrower
// object (e.g. telemetryHandler's partial device shape).
type DeviceRef = { id: string; serialNumber: string };

interface CommandInput {
  command: string;
  mode: CommandMode;
  params?: Record<string, unknown>;
  // What gets written to CommandLog.params (platform-side context, e.g. { vlanId }).
  // Defaults to `params` when omitted.
  logParams?: Record<string, unknown>;
}

// Fire-and-forget: logs the command and publishes it to switch/<sn>/request.
// Used when the caller doesn't need to wait for the switch's response (e.g. sendCommand,
// telemetry-driven identity recovery).
export const publishCommand = async (
  device: DeviceRef,
  input: CommandInput
): Promise<{ requestId: string; commandLogId: string }> => {
  const { command, mode, params = {}, logParams } = input;
  const requestId = `req_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
  const payload: CommandRequestPayload = { request_id: requestId, command, mode, params };

  const log = await prisma.commandLog.create({
    data: { deviceId: device.id, requestId, command, params: (logParams ?? params) as object },
  });

  mqttClient.publish(`switch/${device.serialNumber}/request`, JSON.stringify(payload), { qos: 1 });

  return { requestId, commandLogId: log.id };
};

// Thrown by runDeviceCommand when the switch doesn't respond in time — carries requestId so
// callers can still report it (e.g. in a 504 response) the way they could before this was
// generated inline.
export class CommandTimeoutError extends Error {
  constructor(public requestId: string) {
    super("Timed out waiting for device response");
  }
}

// Publishes the command and waits for the switch's response on switch/<sn>/response
// (via commandWaiter.ts). Used when the caller needs the switch's result before responding
// to its own HTTP request (e.g. VLAN create/delete).
export const runDeviceCommand = async (
  device: DeviceRef,
  input: CommandInput,
  timeoutMs?: number
): Promise<{ requestId: string; commandLogId: string; response: CommandResponsePayload }> => {
  const { requestId, commandLogId } = await publishCommand(device, input);
  try {
    const response = await waitForResponse(requestId, timeoutMs);
    return { requestId, commandLogId, response };
  } catch {
    throw new CommandTimeoutError(requestId);
  }
};
