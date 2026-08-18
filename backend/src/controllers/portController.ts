import type { Response } from "express";
import type { Device } from "@prisma/client";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import type { newReq } from "../schema/types.js";

// Helper: find device by DB id OR serialNumber (mirrors vlanController.ts)
const findDeviceById = async (id: string) => {
  return prisma.device.findFirst({
    where: { OR: [{ id }, { serialNumber: id }] },
  });
};

type AccessResult =
  | { ok: true; device: Device }
  | { ok: false; status: number; message: string };

// Helper: verify device exists and the user may configure it (mirrors vlanController.ts)
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

const VALID_PORT_TYPES = ["access", "trunk"] as const;
type PortType = (typeof VALID_PORT_TYPES)[number];

// GET /api/v1/device/:id/ports
// Port list comes from the device's latest telemetry (live interface names + status);
// each interface is left-joined against the Port table for the platform-side
// description/portType/vlanId config (defaults: "access" / vlan 1 when unset).
export const listPorts = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const [latestTelemetry, portConfigs] = await Promise.all([
    prisma.telemetry.findFirst({
      where: { deviceId: device.id },
      orderBy: { createdAt: "desc" },
      include: { interfaceStats: true },
    }),
    prisma.port.findMany({ where: { deviceId: device.id } }),
  ]);

  const configByName = new Map(portConfigs.map((p) => [p.name, p]));
  const interfaceStats = latestTelemetry?.interfaceStats ?? [];
  const seen = new Set(interfaceStats.map((s) => s.port));

  const ports = interfaceStats.map((stat) => {
    const config = configByName.get(stat.port);
    return {
      name: stat.port,
      status: stat.status,
      description: config?.description ?? null,
      portType: config?.portType ?? "access",
      vlanId: config?.vlanId ?? 1,
    };
  });

  // Include configured ports the device hasn't reported telemetry for yet (e.g. offline device)
  for (const config of portConfigs) {
    if (!seen.has(config.name)) {
      ports.push({
        name: config.name,
        status: "unknown",
        description: config.description,
        portType: config.portType,
        vlanId: config.vlanId,
      });
    }
  }

  return res.status(200).json(new ApiResponse(200, { ports }, "Ports fetched"));
});

// PATCH /api/v1/device/:id/ports
// DB-only update for now. Pushing switchport mode/vlan/description to the switch needs
// entering an interface context first (`interface X` then a subcommand) — the live MQTT
// protocol only supports mode: "exec"|"config" with a single command string, and array-form
// commands (which would let this be one request) already failed live testing (see
// vlanController.ts history). Stubbed until Jack Jack confirms the mechanism — the switch
// publish would go right where the comment below is, as a single isolated call.
export const updatePort = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const { name, description, portType, vlanId } = req.body as {
    name?: unknown;
    description?: unknown;
    portType?: unknown;
    vlanId?: unknown;
  };

  if (typeof name !== "string" || !name.trim())
    return res.status(400).json(new ApiResponse(400, {}, "name is required"));
  if (portType !== undefined && !VALID_PORT_TYPES.includes(portType as PortType))
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `portType must be one of: ${VALID_PORT_TYPES.join(", ")}`));
  if (description !== undefined && description !== null && typeof description !== "string")
    return res.status(400).json(new ApiResponse(400, {}, "description must be a string or null"));
  if (
    vlanId !== undefined &&
    (typeof vlanId !== "number" || !Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094)
  )
    return res.status(400).json(new ApiResponse(400, {}, "vlanId must be an integer between 1 and 4094"));

  const data: { description?: string | null; portType?: PortType; vlanId?: number } = {};
  if (description !== undefined) data.description = description as string | null;
  if (portType !== undefined) data.portType = portType as PortType;
  if (vlanId !== undefined) data.vlanId = vlanId;

  const port = await prisma.port.upsert({
    where: { deviceId_name: { deviceId: device.id, name: name.trim() } },
    create: {
      deviceId: device.id,
      name: name.trim(),
      description: data.description ?? null,
      portType: data.portType ?? "access",
      vlanId: data.vlanId ?? 1,
    },
    update: data,
  });

  // TODO: sendPortConfigToDevice(device, port) — needs Jack Jack's confirmation on how to
  // send a multi-step interface-context command under the current MQTT protocol.

  return res.status(200).json(new ApiResponse(200, { port }, "Port configuration saved"));
});
