import type { Response } from "express";
import type { Device } from "@prisma/client";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands } from "../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../services/deviceCommand.js";
import { parseVlanRange } from "../utils/vlanList.js";
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

const isValidVlanId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4094;

const parseVlanId = (raw: unknown): number | null => {
  const num = typeof raw === "string" ? Number(raw) : raw;
  return isValidVlanId(num) ? num : null;
};

// POST /api/v1/device/:id/vlan
// Body: { vlanId: number | string, name?: string }. vlanId also accepts a range string
// (CLI ref: "Creating VLAN" — "vlan-range example: 2-10") to create multiple VLANs with one
// switch command; `name` only applies to a single-VLAN create (a range gets default names).
export const createVlan = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const { vlanId: vlanIdRaw, name: nameRaw } = req.body as { vlanId?: unknown; name?: unknown };
  if (vlanIdRaw === undefined || vlanIdRaw === null || vlanIdRaw === "")
    return res.status(400).json(new ApiResponse(400, {}, "vlanId is required"));

  const parsed = parseVlanRange(String(vlanIdRaw));
  if ("error" in parsed) return res.status(400).json(new ApiResponse(400, {}, parsed.error));
  const { ids, spec } = parsed;

  if (device.status !== "online")
    return res
      .status(409)
      .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure VLANs`));

  const existingVlans = await prisma.vlan.findMany({ where: { deviceId: device.id, vlanId: { in: ids } } });
  if (existingVlans.length > 0)
    return res
      .status(409)
      .json(
        new ApiResponse(
          409,
          {},
          `VLAN(s) already exist on this device: ${existingVlans.map((v) => v.vlanId).join(", ")}`
        )
      );

  const commands = getDeviceCommands(device.model);

  try {
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.vlan.create(spec),
      logParams: { vlanSpec: spec, vlanIds: ids },
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

    const singleName = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : undefined;
    const vlans = await prisma.$transaction(
      ids.map((vlanId) =>
        prisma.vlan.create({
          data: { name: ids.length === 1 && singleName ? singleName : `VLAN${vlanId}`, vlanId, deviceId: device.id },
        })
      )
    );

    return res
      .status(200)
      .json(new ApiResponse(200, { vlans, requestId }, ids.length === 1 ? "VLAN created successfully" : `VLANs ${spec} created successfully`));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res
      .status(504)
      .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// DELETE /api/v1/device/:id/vlan/:vlanId
// :vlanId also accepts a range string, e.g. "2-10", to delete multiple VLANs with one command.
export const deleteVlan = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  const vlanIdParam = req.params.vlanId;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
  if (!vlanIdParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: vlanId"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const parsed = parseVlanRange(vlanIdParam);
  if ("error" in parsed) return res.status(400).json(new ApiResponse(400, {}, parsed.error));
  const { ids, spec } = parsed;

  const existingVlans = await prisma.vlan.findMany({ where: { deviceId: device.id, vlanId: { in: ids } } });
  if (existingVlans.length !== ids.length) {
    const foundIds = new Set(existingVlans.map((v) => v.vlanId));
    const missing = ids.filter((id) => !foundIds.has(id));
    return res
      .status(404)
      .json(new ApiResponse(404, {}, `VLAN(s) not found on this device: ${missing.join(", ")}`));
  }

  // ?force=true skips the device command entirely and only removes our DB record — for VLANs
  // that have already drifted off the switch (e.g. removed outside the platform), where a normal
  // delete has nothing to delete and the switch will always reject it. No device round-trip
  // happens, so this doesn't require the device to be online.
  if (req.query.force === "true") {
    await prisma.vlan.deleteMany({ where: { deviceId: device.id, vlanId: { in: ids } } });
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          ids.length === 1
            ? "VLAN removed from platform records (no command sent to device)"
            : `VLANs ${spec} removed from platform records (no command sent to device)`
        )
      );
  }

  if (device.status !== "online")
    return res
      .status(409)
      .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure VLANs`));

  const commands = getDeviceCommands(device.model);

  try {
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.vlan.delete(spec),
      logParams: { vlanSpec: spec, vlanIds: ids },
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

    await prisma.vlan.deleteMany({ where: { deviceId: device.id, vlanId: { in: ids } } });

    return res
      .status(200)
      .json(new ApiResponse(200, { requestId }, ids.length === 1 ? "VLAN deleted successfully" : `VLANs ${spec} deleted successfully`));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res
      .status(504)
      .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// PATCH /api/v1/device/:id/vlan/:vlanId
// DB-only update: VLAN name is a platform-side label, not pushed to the switch (no CLI
// command for it).
export const updateVlan = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  const vlanIdParam = req.params.vlanId;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
  if (!vlanIdParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: vlanId"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const vlanId = parseVlanId(vlanIdParam);
  if (vlanId === null)
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "vlanId must be an integer between 1 and 4094"));

  const existingVlan = await prisma.vlan.findFirst({ where: { deviceId: device.id, vlanId } });
  if (!existingVlan)
    return res.status(404).json(new ApiResponse(404, {}, `VLAN ${vlanId} not found on this device`));

  const { name } = req.body as { name?: unknown };

  if (typeof name !== "string" || !name.trim())
    return res.status(400).json(new ApiResponse(400, {}, "name must be a non-empty string"));
  const data = { name: name.trim() };

  const vlan = await prisma.vlan.update({ where: { id: existingVlan.id }, data });
  return res.status(200).json(new ApiResponse(200, { vlan }, "VLAN updated"));
});

// GET /api/v1/device/:id/vlan
export const listVlans = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));

  const vlans = await prisma.vlan.findMany({
    where: { deviceId: access.device.id },
    orderBy: { vlanId: "asc" },
  });
  return res.status(200).json(new ApiResponse(200, { vlans }, "VLANs fetched"));
});
