import type { Response } from "express";
import type { Device } from "@prisma/client";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands } from "../commands/deviceCommands.js";
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

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const isValidIpv4 = (v: string): boolean => {
  const m = v.match(IPV4_RE);
  if (!m) return false;
  return [m[1], m[2], m[3], m[4]].map(Number).every((o) => o >= 0 && o <= 255);
};
const IPV4_CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
const isValidIpv4Cidr = (v: string): boolean => {
  const m = v.match(IPV4_CIDR_RE);
  if (!m) return false;
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  const prefix = Number(m[5]);
  return octets.every((o) => o >= 0 && o <= 255) && prefix >= 0 && prefix <= 32;
};

// Same loose-but-workable pattern already used in l3InterfaceController.ts, for consistency.
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const isValidIpv6 = (v: string): boolean => IPV6_RE.test(v) && v.includes(":");
const IPV6_CIDR_RE = /^[0-9a-fA-F:]+\/\d{1,3}$/;
const isValidIpv6Cidr = (v: string): boolean => {
  if (!IPV6_CIDR_RE.test(v)) return false;
  const [addr, prefix] = v.split("/");
  return addr!.includes(":") && Number(prefix) <= 128;
};

// Runs one command, marks `configSaved: false` on success (an unwritten change now exists),
// and reports a uniform result shape. Shared by every simple System PATCH endpoint below.
const runAndPersist = async (
  device: Device,
  res: Response,
  spec: { command: string; mode: "config" | "exec"; params?: Record<string, unknown> },
  logParams: Record<string, unknown>,
  dbUpdate: Record<string, unknown>
) => {
  try {
    const { requestId, response } = await runDeviceCommand(device, { ...spec, logParams });
    if (response.status !== 0) {
      return res
        .status(422)
        .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
    }
    const updated = await prisma.device.update({ where: { id: device.id }, data: { ...dbUpdate, configSaved: false } });
    return res.status(200).json(new ApiResponse(200, { device: updated, requestId }, "Updated"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
};

// GET /api/v1/device/:id/system
export const getSystemSettings = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const d = access.device;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        hostname: d.hostname,
        ntpServer: d.ntpServer,
        timezone: d.timezone,
        webServerMode: d.webServerMode,
        telnetServerEnabled: d.telnetServerEnabled,
        sshServerEnabled: d.sshServerEnabled,
        managementVlanId: d.managementVlanId,
        managementIpMode: d.managementIpMode,
        managementIp: d.managementIp,
        managementGateway: d.managementGateway,
        managementIpv6Mode: d.managementIpv6Mode,
        managementIpv6: d.managementIpv6,
        managementIpv6Gateway: d.managementIpv6Gateway,
        configSaved: d.configSaved,
      },
      "System settings fetched"
    )
  );
});

const requireOnline = (device: Device, res: Response): boolean => {
  if (device.status !== "online") {
    res.status(409).json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure this`));
    return false;
  }
  return true;
};

// PATCH /api/v1/device/:id/system/hostname — { hostname: string | null }
export const updateHostname = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const hostname = (req.body as { hostname?: unknown })?.hostname;
  if (hostname !== null && (typeof hostname !== "string" || !hostname.trim()))
    return res.status(400).json(new ApiResponse(400, {}, "hostname must be a non-empty string, or null to clear"));
  if (typeof hostname === "string" && Buffer.byteLength(hostname, "utf8") > 63)
    return res.status(400).json(new ApiResponse(400, {}, "hostname must be at most 63 bytes"));

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;
  return runAndPersist(
    device,
    res,
    hostname === null ? commands.system.clearHostname() : commands.system.setHostname(hostname.trim()),
    { field: "hostname", value: hostname },
    { hostname: hostname === null ? null : hostname.trim() }
  );
});

// PATCH /api/v1/device/:id/system/ntp — { ntpServer: string }
export const updateNtpServer = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const ntpServer = (req.body as { ntpServer?: unknown })?.ntpServer;
  if (typeof ntpServer !== "string" || !isValidIpv4(ntpServer))
    return res.status(400).json(new ApiResponse(400, {}, "ntpServer must be a valid IPv4 address — domain names are not supported"));

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;
  return runAndPersist(device, res, commands.system.setNtpServer(ntpServer), { field: "ntpServer", value: ntpServer }, { ntpServer });
});

// PATCH /api/v1/device/:id/system/timezone — { timezone: string }
export const updateTimezone = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const timezone = (req.body as { timezone?: unknown })?.timezone;
  if (typeof timezone !== "string" || !timezone.trim())
    return res.status(400).json(new ApiResponse(400, {}, "timezone is required, e.g. 'Shanghai', 'Hong_Kong', 'UTC'"));

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;
  return runAndPersist(device, res, commands.system.setTimezone(timezone.trim()), { field: "timezone", value: timezone }, { timezone: timezone.trim() });
});

const VALID_WEB_MODES = ["all", "http", "https"] as const;

// PATCH /api/v1/device/:id/system/web-server — { mode: "all"|"http"|"https"|null }
export const updateWebServer = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const mode = (req.body as { mode?: unknown })?.mode;
  if (mode !== null && !VALID_WEB_MODES.includes(mode as (typeof VALID_WEB_MODES)[number]))
    return res.status(400).json(new ApiResponse(400, {}, `mode must be one of: ${VALID_WEB_MODES.join(", ")}, or null to disable`));

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;
  return runAndPersist(
    device,
    res,
    commands.system.setWebServer(mode as "all" | "http" | "https" | null),
    { field: "webServerMode", value: mode },
    { webServerMode: mode }
  );
});

// PATCH /api/v1/device/:id/system/telnet-server — { enabled: boolean }
export const updateTelnetServer = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "enabled must be a boolean"));

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;
  return runAndPersist(device, res, commands.system.setTelnetServer(enabled), { field: "telnetServerEnabled", value: enabled }, { telnetServerEnabled: enabled });
});

// PATCH /api/v1/device/:id/system/ssh-server — { enabled: boolean }
export const updateSshServer = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const enabled = (req.body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "enabled must be a boolean"));

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;
  return runAndPersist(device, res, commands.system.setSshServer(enabled), { field: "sshServerEnabled", value: enabled }, { sshServerEnabled: enabled });
});

// PATCH /api/v1/device/:id/system/management-ip
// Body: { vlanId, mode: "static"|"dhcp", ip?, gateway?, confirm: true }
// The single most sensitive command in the app — it can move (or break) the very path this
// platform uses to reach the switch. Always confirm-gated; NOT live-tested against this
// device's real management VLAN for that reason (see commands/deviceCommands.ts).
export const updateManagementIp = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const body = req.body as { vlanId?: unknown; mode?: unknown; ip?: unknown; gateway?: unknown; confirm?: unknown };
  if (body.confirm !== true)
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "confirm must be true — changing the management IP can disconnect this platform from the device"));

  const vlanId = body.vlanId;
  if (typeof vlanId !== "number" || !Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094)
    return res.status(400).json(new ApiResponse(400, {}, "vlanId must be an integer between 1 and 4094"));

  if (body.mode !== "static" && body.mode !== "dhcp")
    return res.status(400).json(new ApiResponse(400, {}, "mode must be 'static' or 'dhcp'"));

  let ip: string | undefined;
  let gateway: string | undefined;
  if (body.mode === "static") {
    if (typeof body.ip !== "string" || !isValidIpv4Cidr(body.ip))
      return res.status(400).json(new ApiResponse(400, {}, "ip must be in A.B.C.D/M form for static mode"));
    if (typeof body.gateway !== "string" || !isValidIpv4(body.gateway))
      return res.status(400).json(new ApiResponse(400, {}, "gateway must be a valid IPv4 address for static mode"));
    ip = body.ip;
    gateway = body.gateway;
  }

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;
  return runAndPersist(
    device,
    res,
    body.mode === "static" ? commands.system.setManagementIpStatic(vlanId, ip!, gateway!) : commands.system.setManagementIpDhcp(vlanId),
    { field: "managementIp", vlanId, mode: body.mode, ip, gateway },
    { managementVlanId: vlanId, managementIpMode: body.mode, managementIp: ip ?? null, managementGateway: gateway ?? null }
  );
});

// PATCH /api/v1/device/:id/system/management-ipv6
// Body: { vlanId, mode: "static"|"dhcp", ip?, gateway?, confirm: true }
// IPv6 counterpart of updateManagementIp above — same sensitivity, same confirm gate. Independent
// CLI section from the IPv4 form (see commands/system/types.ts); NOT live-tested for the same
// reason as the IPv4 form.
export const updateManagementIpv6 = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const body = req.body as { vlanId?: unknown; mode?: unknown; ip?: unknown; gateway?: unknown; confirm?: unknown };
  if (body.confirm !== true)
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "confirm must be true — changing the management IP can disconnect this platform from the device"));

  const vlanId = body.vlanId;
  if (typeof vlanId !== "number" || !Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094)
    return res.status(400).json(new ApiResponse(400, {}, "vlanId must be an integer between 1 and 4094"));

  if (body.mode !== "static" && body.mode !== "dhcp")
    return res.status(400).json(new ApiResponse(400, {}, "mode must be 'static' or 'dhcp'"));

  let ip: string | undefined;
  let gateway: string | undefined;
  if (body.mode === "static") {
    if (typeof body.ip !== "string" || !isValidIpv6Cidr(body.ip))
      return res.status(400).json(new ApiResponse(400, {}, "ip must be in X:X::X:X/M form for static mode"));
    if (typeof body.gateway !== "string" || !isValidIpv6(body.gateway))
      return res.status(400).json(new ApiResponse(400, {}, "gateway must be a valid IPv6 address for static mode"));
    ip = body.ip;
    gateway = body.gateway;
  }

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;
  return runAndPersist(
    device,
    res,
    body.mode === "static" ? commands.system.setManagementIpv6Static(vlanId, ip!, gateway!) : commands.system.setManagementIpv6Dhcp(vlanId),
    { field: "managementIpv6", vlanId, mode: body.mode, ip, gateway },
    { managementVlanId: vlanId, managementIpv6Mode: body.mode, managementIpv6: ip ?? null, managementIpv6Gateway: gateway ?? null }
  );
});

// POST /api/v1/device/:id/system/write — saves the running config so it survives a reboot.
export const writeConfig = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;

  try {
    const { requestId, response } = await runDeviceCommand(device, { ...commands.system.writeConfig(), logParams: {} });
    if (response.status !== 0) {
      return res
        .status(422)
        .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
    }
    await prisma.device.update({ where: { id: device.id }, data: { configSaved: true } });
    return res.status(200).json(new ApiResponse(200, { requestId }, "Configuration saved"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// POST /api/v1/device/:id/system/reload — { confirm: true }. Reboots the device.
export const reloadDevice = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  if ((req.body as { confirm?: unknown })?.confirm !== true)
    return res.status(400).json(new ApiResponse(400, {}, "confirm must be true — this reboots the device"));

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;

  try {
    const { requestId, response } = await runDeviceCommand(device, { ...commands.system.reload(), logParams: {} });
    if (response.status !== 0) {
      return res
        .status(422)
        .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
    }
    return res.status(200).json(new ApiResponse(200, { requestId }, "Reload initiated"));
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});

// POST /api/v1/device/:id/system/factory-restore — { confirm: true }
// CLI ref: "Restore Configuration" — copy default-config startup-config, then reload for it to
// take effect. Wipes VLANs/ports/everything back to factory defaults. Both steps run here since
// the doc presents them as one operation; the copy step's own success/failure is still reported
// separately so a rejection there doesn't get masked by a reload that never should have run.
export const factoryRestore = asyncHandlers(async (req: newReq, res: Response) => {
  const access = await verifyDeviceAccess(req, req.params.id!);
  if (!access.ok) return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  if ((req.body as { confirm?: unknown })?.confirm !== true)
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "confirm must be true — this wipes the device's configuration back to factory defaults"));

  const commands = getDeviceCommands(device.model);
  if (!requireOnline(device, res)) return;

  try {
    const copyResult = await runDeviceCommand(device, { ...commands.system.factoryRestoreConfig(), logParams: {} });
    if (copyResult.response.status !== 0) {
      return res
        .status(422)
        .json(
          new ApiResponse(
            422,
            { requestId: copyResult.requestId, switchStatus: copyResult.response.status },
            copyResult.response.message || "Switch rejected the restore command"
          )
        );
    }

    const reloadResult = await runDeviceCommand(device, { ...commands.system.reload(), logParams: {} });
    return res.status(200).json(
      new ApiResponse(
        200,
        { copyRequestId: copyResult.requestId, reloadRequestId: reloadResult.requestId },
        "Factory restore initiated — the device is reloading"
      )
    );
  } catch (err) {
    const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
    return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
  }
});
