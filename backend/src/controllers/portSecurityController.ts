import type { Response } from "express";
import type { Device } from "@prisma/client";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands } from "../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../services/deviceCommand.js";
import type { InterfaceTarget } from "../commands/deviceCommands.js";
import type { newReq } from "../schema/types.js";

// Helper: find device by DB id OR serialNumber (mirrors deviceController.ts)
const findDeviceById = async (id: string) => {
  return prisma.device.findFirst({
    where: { OR: [{ id }, { serialNumber: id }] },
  });
};

type AccessResult =
  | { ok: true; device: Device }
  | { ok: false; status: number; message: string };

// Helper: verify device exists and the user may configure it (mirrors deviceController.ts)
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

// ─── "switchport port-security mac-address" (TR only) — individually-configured secure MAC
// entries per port. See schema.prisma's PortSecurityMac model comment and
// commands/portSecurity/tr.ts for the confirmed CLI syntax.

interface StaticMacBody {
  port?: unknown;
  macAddress?: unknown;
  sticky?: unknown;
}

const parseStaticMacBody = (body: StaticMacBody) => {
  const port = typeof body.port === "string" ? body.port.trim() : "";
  if (!port) return { error: "Port is required" };

  const macAddress = typeof body.macAddress === "string" ? body.macAddress.trim() : "";
  if (!macAddress) return { error: "MAC Address is required" };

  if (body.sticky !== undefined && typeof body.sticky !== "boolean")
    return { error: "sticky must be a boolean" };

  return { data: { port, macAddress: macAddress.toLowerCase(), sticky: body.sticky === true } };
};

// POST /api/v1/device/:id/port-security-macs
export const createPortSecurityMac = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const parsed = parseStaticMacBody(req.body as StaticMacBody);
  if ("error" in parsed) return res.status(400).json(new ApiResponse(400, {}, parsed.error));
  const { port, macAddress, sticky } = parsed.data;

  const commands = getDeviceCommands(device.model);
  if (!commands.portSecurity.bindStaticMac || !commands.portSecurity.unbindStaticMac)
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `Static secure MAC entries are not supported on this device model (${device.model})`));

  if (!commands.portSecurity.validateMac(macAddress))
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `MAC Address must be in the format ${commands.portSecurity.macFormatHint}`));

  if (device.status !== "online")
    return res
      .status(409)
      .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure port security`));

  const existing = await prisma.portSecurityMac.findFirst({
    where: { deviceId: device.id, port, macAddress },
  });
  if (existing)
    return res
      .status(409)
      .json(new ApiResponse(409, {}, "This MAC address is already configured as a secure MAC on this port"));

  try {
    const target: InterfaceTarget = { kind: "single", port };
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.portSecurity.bindStaticMac(target, macAddress, sticky),
      logParams: { port, macAddress, sticky },
    });

    if (response.status !== 0) {
      return res
        .status(422)
        .json(
          new ApiResponse(
            422,
            { requestId, switchStatus: response.status },
            response.message || "Switch rejected the command"
          )
        );
    }

    const entry = await prisma.portSecurityMac.create({
      data: { deviceId: device.id, port, macAddress, sticky },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, { entry, requestId }, "Secure MAC address added successfully"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res
      .status(504)
      .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// DELETE /api/v1/device/:id/port-security-macs/:entryId
export const deletePortSecurityMac = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  const entryId = req.params.entryId;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
  if (!entryId)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: entryId"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const existing = await prisma.portSecurityMac.findFirst({ where: { id: entryId, deviceId: device.id } });
  if (!existing)
    return res.status(404).json(new ApiResponse(404, {}, "Entry not found on this device"));

  const commands = getDeviceCommands(device.model);
  if (!commands.portSecurity.unbindStaticMac)
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `Static secure MAC entries are not supported on this device model (${device.model})`));

  if (device.status !== "online")
    return res
      .status(409)
      .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure port security`));

  try {
    const target: InterfaceTarget = { kind: "single", port: existing.port };
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.portSecurity.unbindStaticMac(target, existing.macAddress),
      logParams: { entryId: existing.id },
    });

    if (response.status !== 0) {
      return res
        .status(422)
        .json(
          new ApiResponse(
            422,
            { requestId, switchStatus: response.status },
            response.message || "Switch rejected the command"
          )
        );
    }

    await prisma.portSecurityMac.delete({ where: { id: existing.id } });

    return res.status(200).json(new ApiResponse(200, { requestId }, "Secure MAC address removed successfully"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res
      .status(504)
      .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// GET /api/v1/device/:id/port-security-macs
export const listPortSecurityMacs = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));

  const entries = await prisma.portSecurityMac.findMany({
    where: { deviceId: access.device.id },
    orderBy: { createdAt: "asc" },
  });
  return res.status(200).json(new ApiResponse(200, { entries }, "Secure MAC entries fetched"));
});
