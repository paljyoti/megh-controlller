import type { Response } from "express";
import type { Device } from "@prisma/client";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands, getDeviceCapabilities } from "../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../services/deviceCommand.js";
import type { newReq } from "../schema/types.js";

const findDeviceById = async (id: string) => {
  return prisma.device.findFirst({
    where: { OR: [{ id }, { serialNumber: id }] },
  });
};

type AccessResult =
  | { ok: true; device: Device }
  | { ok: false; status: number; message: string };

const verifyDeviceAccess = async (req: newReq, deviceId: string): Promise<AccessResult> => {
  const device = await findDeviceById(deviceId);
  if (!device) return { ok: false, status: 404, message: "Device not found" };
  if (!req.user) return { ok: false, status: 401, message: "unauthorized request" };

  if (req.user.role === "SUPERADMIN") return { ok: true, device };

  if (req.user.role === "ADMIN") {
    if (device.organizationId !== req.user.orgs?.id)
      return { ok: false, status: 403, message: "Access denied: device not in your organization" };
    return { ok: true, device };
  }

  if (device.assignedToId !== req.user.id)
    return { ok: false, status: 403, message: "Access denied: device not assigned to you" };
  return { ok: true, device };
};

// LOOP-DETECT has no equivalent in AC5's CLI reference — commands.loopDetect is undefined for
// any model without it. Every handler below checks this first so an unsupported device gets a
// clear 400 instead of a crash on `commands.loopDetect.foo(...)`.
const requireSupport = (device: Device, res: Response): boolean => {
  if (!getDeviceCapabilities(device.model).loopDetection) {
    res.status(400).json(new ApiResponse(400, {}, `Loop-Detect is not supported on this device model (${device.model})`));
    return false;
  }
  return true;
};

const requireOnline = (device: Device, res: Response): boolean => {
  if (device.status !== "online") {
    res.status(409).json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure this`));
    return false;
  }
  return true;
};

// GET /api/v1/device/:id/loop-detect
export const getLoopDetectSettings = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const d = access.device;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        supported: getDeviceCapabilities(d.model).loopDetection,
        enabled: d.loopDetectEnabled,
        interval: d.loopDetectInterval,
        trapEnabled: d.loopDetectTrapEnabled,
        errdisableTimeoutEnabled: d.errdisableTimeoutEnabled,
        errdisableTimeoutInterval: d.errdisableTimeoutInterval,
      },
      "Loop-Detect settings fetched"
    )
  );
});

// PATCH /api/v1/device/:id/loop-detect/global — { enabled: boolean }
export const updateLoopDetectGlobal = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;
  if (!requireSupport(device, res)) return;

  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") return res.status(400).json(new ApiResponse(400, {}, "enabled must be a boolean"));
  if (!requireOnline(device, res)) return;

  const commands = getDeviceCommands(device.model);
  try {
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.loopDetect!.setGlobalEnabled(enabled),
      logParams: { enabled },
    });
    if (response.status !== 0)
      return res.status(422).json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));

    const updated = await prisma.device.update({ where: { id: device.id }, data: { loopDetectEnabled: enabled } });
    return res.status(200).json(new ApiResponse(200, { enabled: updated.loopDetectEnabled, requestId }, "Loop-Detect global setting updated"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// PATCH /api/v1/device/:id/loop-detect/interval — { seconds: number } (5-300)
export const updateLoopDetectInterval = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;
  if (!requireSupport(device, res)) return;

  const seconds = (req.body as { seconds?: unknown })?.seconds;
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 5 || seconds > 300)
    return res.status(400).json(new ApiResponse(400, {}, "seconds must be an integer between 5 and 300"));
  if (!requireOnline(device, res)) return;

  const commands = getDeviceCommands(device.model);
  try {
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.loopDetect!.setInterval(seconds),
      logParams: { seconds },
    });
    if (response.status !== 0)
      return res.status(422).json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));

    const updated = await prisma.device.update({ where: { id: device.id }, data: { loopDetectInterval: seconds } });
    return res.status(200).json(new ApiResponse(200, { interval: updated.loopDetectInterval, requestId }, "Loop-Detect interval updated"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// PATCH /api/v1/device/:id/loop-detect/trap — { enabled: boolean }
export const updateLoopDetectTrap = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;
  if (!requireSupport(device, res)) return;

  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") return res.status(400).json(new ApiResponse(400, {}, "enabled must be a boolean"));
  if (!requireOnline(device, res)) return;

  const commands = getDeviceCommands(device.model);
  try {
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.loopDetect!.setTrapEnabled(enabled),
      logParams: { enabled },
    });
    if (response.status !== 0)
      return res.status(422).json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));

    const updated = await prisma.device.update({ where: { id: device.id }, data: { loopDetectTrapEnabled: enabled } });
    return res.status(200).json(new ApiResponse(200, { trapEnabled: updated.loopDetectTrapEnabled, requestId }, "Loop-Detect trap setting updated"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// PATCH /api/v1/device/:id/loop-detect/errdisable-timeout — { enabled: boolean, interval?: number }
// Shared across every errdisable-triggering feature on the device (not loop-detect specific),
// per the CLI doc — "configuring this parameter will affect other applications".
export const updateErrdisableTimeout = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;
  if (!requireSupport(device, res)) return;

  const body = req.body as { enabled?: unknown; interval?: unknown };
  if (typeof body.enabled !== "boolean") return res.status(400).json(new ApiResponse(400, {}, "enabled must be a boolean"));
  if (
    body.interval !== undefined &&
    (typeof body.interval !== "number" || !Number.isInteger(body.interval) || body.interval < 10 || body.interval > 1000000)
  )
    return res.status(400).json(new ApiResponse(400, {}, "interval must be an integer between 10 and 1000000"));
  if (!requireOnline(device, res)) return;

  const commands = getDeviceCommands(device.model);
  try {
    const enabledResult = await runDeviceCommand(device, {
      ...commands.loopDetect!.setErrdisableTimeoutEnabled(body.enabled),
      logParams: { enabled: body.enabled },
    });
    if (enabledResult.response.status !== 0)
      return res
        .status(422)
        .json(new ApiResponse(422, { requestId: enabledResult.requestId, switchStatus: enabledResult.response.status }, enabledResult.response.message || "Switch rejected the command"));

    let intervalRequestId: string | undefined;
    if (body.interval !== undefined) {
      const intervalResult = await runDeviceCommand(device, {
        ...commands.loopDetect!.setErrdisableTimeoutInterval(body.interval),
        logParams: { interval: body.interval },
      });
      if (intervalResult.response.status !== 0)
        return res
          .status(422)
          .json(new ApiResponse(422, { requestId: intervalResult.requestId, switchStatus: intervalResult.response.status }, intervalResult.response.message || "Switch rejected the command"));
      intervalRequestId = intervalResult.requestId;
    }

    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { errdisableTimeoutEnabled: body.enabled, ...(body.interval !== undefined ? { errdisableTimeoutInterval: body.interval } : {}) },
    });
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          errdisableTimeoutEnabled: updated.errdisableTimeoutEnabled,
          errdisableTimeoutInterval: updated.errdisableTimeoutInterval,
          requestId: enabledResult.requestId,
          intervalRequestId,
        },
        "Errdisable timeout settings updated"
      )
    );
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// POST /api/v1/device/:id/loop-detect/recover — { port: string }
export const recoverErrdisablePort = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;
  if (!requireSupport(device, res)) return;

  const port = (req.body as { port?: unknown })?.port;
  if (typeof port !== "string" || !port.trim()) return res.status(400).json(new ApiResponse(400, {}, "port is required"));
  if (!requireOnline(device, res)) return;

  const commands = getDeviceCommands(device.model);
  try {
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.loopDetect!.recoverErrdisablePort(port.trim()),
      logParams: { port: port.trim() },
    });
    if (response.status !== 0)
      return res.status(422).json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));

    return res.status(200).json(new ApiResponse(200, { requestId }, "Port recovered from errdisable"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});
