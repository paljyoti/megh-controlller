import type { Response } from "express";
import type { Device } from "@prisma/client";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands } from "../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../services/deviceCommand.js";
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

const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const computeNetworkAddress = (ip: string, mask: string): string => {
  const ipParts = ip.split(".").map(Number);
  const maskParts = mask.split(".").map(Number);
  return ipParts.map((o, i) => o & (maskParts[i] ?? 0)).join(".");
};

interface AddressSegmentBody {
  start?: unknown;
  end?: unknown;
}

interface DhcpPoolBody {
  gateway?: unknown;
  netmask?: unknown;
  leasePeriod?: unknown;
  leaseDays?: unknown;
  leaseHours?: unknown;
  leaseMinutes?: unknown;
  dns?: unknown;
  backupDns?: unknown;
  option43?: unknown;
  addressSegments?: unknown;
}

const parseDhcpPoolBody = (body: DhcpPoolBody) => {
  const gateway = String(body.gateway ?? "").trim();
  if (!IP_RE.test(gateway)) return { error: "Default Gateway must be a valid IP" };

  const netmask = String(body.netmask ?? "").trim();
  if (!IP_RE.test(netmask)) return { error: "Mask must be a valid IP mask" };

  const leasePeriod = body.leasePeriod === "custom" ? "custom" : "forever";

  let leaseDays: number | null = null;
  let leaseHours: number | null = null;
  let leaseMinutes: number | null = null;
  if (leasePeriod === "custom") {
    leaseDays = Number(body.leaseDays ?? 0);
    leaseHours = Number(body.leaseHours ?? 0);
    leaseMinutes = Number(body.leaseMinutes ?? 0);
    if (
      !Number.isInteger(leaseDays) ||
      !Number.isInteger(leaseHours) ||
      !Number.isInteger(leaseMinutes) ||
      leaseDays < 0 ||
      leaseHours < 0 ||
      leaseHours > 23 ||
      leaseMinutes < 0 ||
      leaseMinutes > 59
    )
      return { error: "Custom lease period is invalid" };
    if (leaseDays === 0 && leaseHours === 0 && leaseMinutes === 0)
      return { error: "Custom lease period must be greater than 0" };
  }

  const dns = String(body.dns ?? "").trim();
  if (!IP_RE.test(dns)) return { error: "DNS must be a valid IP" };

  const backupDns =
    typeof body.backupDns === "string" && body.backupDns.trim() ? body.backupDns.trim() : null;
  if (backupDns && !IP_RE.test(backupDns)) return { error: "Backup DNS must be a valid IP" };

  const option43 =
    typeof body.option43 === "string" && body.option43.trim() ? body.option43.trim() : null;

  const rawSegments = Array.isArray(body.addressSegments)
    ? (body.addressSegments as AddressSegmentBody[])
    : [];
  const addressSegments = rawSegments
    .map((s) => ({ start: String(s.start ?? "").trim(), end: String(s.end ?? "").trim() }))
    .filter((s) => s.start && s.end);
  if (addressSegments.length === 0)
    return { error: "At least one Address Segment is required" };
  for (const seg of addressSegments) {
    if (!IP_RE.test(seg.start) || !IP_RE.test(seg.end))
      return { error: "Address Segment start/end must be valid IPs" };
  }

  const network = computeNetworkAddress(gateway, netmask);

  return {
    data: {
      gateway,
      netmask,
      network,
      leasePeriod,
      leaseDays,
      leaseHours,
      leaseMinutes,
      dns,
      backupDns,
      option43,
      addressSegments,
    },
  };
};

const poolNameFor = (network: string) => `pool_${network.replace(/\./g, "_")}`;

// POST /api/v1/device/:id/dhcp-pool
export const createDhcpPool = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const parsed = parseDhcpPoolBody(req.body as DhcpPoolBody);
  if ("error" in parsed) return res.status(400).json(new ApiResponse(400, {}, parsed.error));
  const poolData = parsed.data;
  const poolName = poolNameFor(poolData.network);

  if (device.status !== "online")
    return res
      .status(409)
      .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure DHCP`));

  const existing = await prisma.dhcpPool.findFirst({
    where: { deviceId: device.id, network: poolData.network, netmask: poolData.netmask },
  });
  if (existing)
    return res
      .status(409)
      .json(new ApiResponse(409, {}, "A DHCP pool for this network/mask already exists on this device"));

  const commands = getDeviceCommands(device.model);

  try {
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.dhcp.create({ ...poolData, poolName }),
      logParams: { ...poolData, poolName },
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

    const pool = await prisma.dhcpPool.create({
      data: {
        ...poolData,
        poolName,
        deviceId: device.id,
      },
    });

    return res
      .status(200)
      .json(new ApiResponse(200, { pool, requestId }, "DHCP pool created successfully"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res
      .status(504)
      .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// DELETE /api/v1/device/:id/dhcp-pool/:poolId
export const deleteDhcpPool = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  const poolId = req.params.poolId;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
  if (!poolId)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: poolId"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const existing = await prisma.dhcpPool.findFirst({ where: { id: poolId, deviceId: device.id } });
  if (!existing)
    return res.status(404).json(new ApiResponse(404, {}, "DHCP pool not found on this device"));

  if (device.status !== "online")
    return res
      .status(409)
      .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure DHCP`));

  const commands = getDeviceCommands(device.model);

  try {
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.dhcp.delete(existing.poolName),
      logParams: { poolId: existing.id, poolName: existing.poolName },
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

    await prisma.dhcpPool.delete({ where: { id: existing.id } });

    return res.status(200).json(new ApiResponse(200, { requestId }, "DHCP pool deleted successfully"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res
      .status(504)
      .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// GET /api/v1/device/:id/dhcp-pool
export const listDhcpPools = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));

  const pools = await prisma.dhcpPool.findMany({
    where: { deviceId: access.device.id },
    orderBy: { createdAt: "asc" },
  });
  return res.status(200).json(new ApiResponse(200, { pools }, "DHCP pools fetched"));
});

const updateStatusField = async (
  req: newReq,
  res: Response,
  field: "status" | "nakStatus",
  commandKey: "setStatus" | "setNakStatus"
) => {
  const deviceParam = req.params.id;
  const poolId = req.params.poolId;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
  if (!poolId)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: poolId"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const value = (req.body as { value?: unknown })?.value;
  if (value !== "enabled" && value !== "disabled")
    return res.status(400).json(new ApiResponse(400, {}, "value must be 'enabled' or 'disabled'"));

  const existing = await prisma.dhcpPool.findFirst({ where: { id: poolId, deviceId: device.id } });
  if (!existing)
    return res.status(404).json(new ApiResponse(404, {}, "DHCP pool not found on this device"));

  if (device.status !== "online")
    return res
      .status(409)
      .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure DHCP`));

  const commands = getDeviceCommands(device.model);

  try {
    const { requestId, response } = await runDeviceCommand(device, {
      ...commands.dhcp[commandKey](existing.poolName, value),
      logParams: { poolId: existing.id, poolName: existing.poolName, [field]: value },
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

    const pool = await prisma.dhcpPool.update({
      where: { id: existing.id },
      data: { [field]: value },
    });

    return res.status(200).json(new ApiResponse(200, { pool, requestId }, "DHCP pool updated successfully"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res
      .status(504)
      .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
};

// PATCH /api/v1/device/:id/dhcp-pool/:poolId/status
export const updateDhcpPoolStatus = asyncHandlers(async (req: newReq, res: Response) =>
  updateStatusField(req, res, "status", "setStatus")
);

// PATCH /api/v1/device/:id/dhcp-pool/:poolId/nak-status
export const updateDhcpPoolNakStatus = asyncHandlers(async (req: newReq, res: Response) =>
  updateStatusField(req, res, "nakStatus", "setNakStatus")
);
