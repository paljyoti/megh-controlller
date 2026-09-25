import type { Response } from "express";
import type { Device, Port } from "@prisma/client";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands, getDeviceCapabilities } from "../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../services/deviceCommand.js";
import type { InterfaceTarget } from "../commands/deviceCommands.js";
import { parseVlanList } from "../utils/vlanList.js";
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

const VALID_PORT_TYPES = ["access", "trunk", "hybrid"] as const;
type PortType = (typeof VALID_PORT_TYPES)[number];

const VALID_ADMIN_STATUSES = ["up", "down"] as const;
type AdminStatus = (typeof VALID_ADMIN_STATUSES)[number];

const VALID_SPEEDS = ["auto", "10", "100", "1000"] as const;
type Speed = (typeof VALID_SPEEDS)[number];

const VALID_DUPLEXES = ["auto", "full", "half"] as const;
type Duplex = (typeof VALID_DUPLEXES)[number];

// CLI ref: "Configuring Interface Flowcontrol" — SWITCH(config-if)# flowcontrol {on | off}
const VALID_FLOW_CONTROLS = ["on", "off"] as const;
type FlowControl = (typeof VALID_FLOW_CONTROLS)[number];

// CLI ref: "Configuring Interface MTU" — range is 46 to 10222 bytes; default is 1500 bytes.
const MIN_MTU = 46;
const MAX_MTU = 10222;

// CLI ref: "Configuring Interface Medium Type" — SWITCH(config-if)# medium (copper | fiber)
const VALID_MEDIUMS = ["copper", "fiber"] as const;
type Medium = (typeof VALID_MEDIUMS)[number];

// CLI ref: "Configuring SFP Interface Mode" — SWITCH(config-if)# port mode {sgmii | 2500BASE-X | 1000BASE-X | 10G}
const VALID_SFP_MODES = ["sgmii", "2500BASE-X", "1000BASE-X", "10G"] as const;
type SfpMode = (typeof VALID_SFP_MODES)[number];

// CLI ref: "Configuring Interface Auto negotiation" — SWITCH(config-if)# autoneg on / no autoneg
const VALID_AUTONEGS = ["on", "off"] as const;
type Autoneg = (typeof VALID_AUTONEGS)[number];

// CLI ref: "Adding a Description for an Interface" — up to 80 characters
const MAX_DESCRIPTION_LENGTH = 80;

// CLI ref: "Configuring LACP Interface Priority" — range 1-65535, default 32768
const MIN_LACP_PRIORITY = 1;
const MAX_LACP_PRIORITY = 65535;

// CLI ref: "Configuring LACP Timeout Mode" — "long" | "short"
const VALID_LACP_TIMEOUTS = ["long", "short"] as const;
type LacpTimeout = (typeof VALID_LACP_TIMEOUTS)[number];

// CLI ref: "Configure Port Loop Action" — TR models only, see commands/loopDetect/types.ts
const VALID_LOOP_ACTIONS = ["alarm", "error-down"] as const;
type LoopAction = (typeof VALID_LOOP_ACTIONS)[number];

// CLI ref: "Configure Edge Port" — TR models only, see commands/stp/types.ts
const VALID_STP_EDGE_MODES = ["edgeport", "autoedge"] as const;
type StpEdgeMode = (typeof VALID_STP_EDGE_MODES)[number];

// CLI ref: "poe priority {high|low|medium}" — TR models only, see commands/poe/types.ts
const VALID_POE_PRIORITIES = ["low", "medium", "high"] as const;
type PoePriority = (typeof VALID_POE_PRIORITIES)[number];

// CLI ref: "poe max-power VALUE" — confirmed range is port-type dependent (1-30 for .3at,
// 1-90 for .3bt); we validate the wider bound and let the switch enforce the real one.
const MIN_POE_MAX_POWER = 1;
const MAX_POE_MAX_POWER = 90;

// CLI ref: "poe pd-detect mode {by-flow|by-ping IPADDR}" — TR models only, confirmed live.
const VALID_PD_DETECT_MODES = ["none", "by-flow", "by-ping"] as const;
type PdDetectMode = (typeof VALID_PD_DETECT_MODES)[number];
const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
// CLI ref: "poe pd-detect parameter interval VALUE times VALUE" — confirmed live ranges.
const MIN_PD_DETECT_INTERVAL = 5;
const MAX_PD_DETECT_INTERVAL = 60;
const MIN_PD_DETECT_TIMES = 3;
const MAX_PD_DETECT_TIMES = 30;

// CLI ref: "switchport port-security" — TR models only, confirmed live.
const MIN_PORT_SECURITY_AGING_TIME = 0;
const MAX_PORT_SECURITY_AGING_TIME = 1440;
const MIN_PORT_SECURITY_MAXIMUM = 1;
const MAX_PORT_SECURITY_MAXIMUM = 1024;
const VALID_PORT_SECURITY_VIOLATIONS = ["restrict", "shutdown"] as const;
type PortSecurityViolation = (typeof VALID_PORT_SECURITY_VIOLATIONS)[number];

// GET /api/v1/device/:id/ports
// Port list comes from the device's latest telemetry (live interface names + status);
// each interface is left-joined against the Port table for the platform-side
// description/portType/vlanId/... config (defaults applied when unset).
export const listPorts = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;
  const commands = getDeviceCommands(device.model);

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

  const shapePort = (name: string, status: string, config: Port | undefined) => ({
    name,
    status,
    description: config?.description ?? null,
    portType: config?.portType ?? "access",
    vlanId: config?.vlanId ?? 1,
    adminStatus: config?.adminStatus ?? "up",
    speed: config?.speed ?? "auto",
    duplex: config?.duplex ?? "auto",
    flowControl: config?.flowControl ?? "off",
    mtu: config?.mtu ?? 1500,
    medium: config?.medium ?? "copper",
    sfpMode: config?.sfpMode ?? null,
    autoneg: config?.autoneg ?? "on",
    trunkAllowedVlan: config?.trunkAllowedVlan ?? "all",
    hybridAllowedVlan: config?.hybridAllowedVlan ?? "all",
    hybridUntaggedVlan: config?.hybridUntaggedVlan ?? "",
    lacpPortPriority: config?.lacpPortPriority ?? 32768,
    lacpTimeout: config?.lacpTimeout ?? "long",
    poeEnabled: config?.poeEnabled ?? true,
    poePriority: config?.poePriority ?? "low",
    poeMaxPower: config?.poeMaxPower ?? null,
    poeForceOn: config?.poeForceOn ?? false,
    poeLegacyMode: config?.poeLegacyMode ?? false,
    poePdDescription: config?.poePdDescription ?? null,
    poePdDetectMode: config?.poePdDetectMode ?? null,
    poePdDetectPeerIp: config?.poePdDetectPeerIp ?? null,
    poePdDetectInterval: config?.poePdDetectInterval ?? null,
    poePdDetectTimes: config?.poePdDetectTimes ?? null,
    portSecurityEnabled: config?.portSecurityEnabled ?? false,
    portSecurityAgingStatic: config?.portSecurityAgingStatic ?? false,
    portSecurityAgingTime: config?.portSecurityAgingTime ?? null,
    portSecurityStickyMac: config?.portSecurityStickyMac ?? false,
    portSecurityMaximum: config?.portSecurityMaximum ?? null,
    portSecurityViolationMode: config?.portSecurityViolationMode ?? null,
    loopDetectEnabled: config?.loopDetectEnabled ?? false,
    loopDetectAction: config?.loopDetectAction ?? "alarm",
    loopDetectVlans: config?.loopDetectVlans ?? null,
    stpPriority: config?.stpPriority ?? 128,
    stpPathCost: config?.stpPathCost ?? null,
    stpEdgePort: config?.stpEdgePort ?? null,
    stpBpduGuard: config?.stpBpduGuard ?? false,
    deviceConfirmed: config?.deviceConfirmed ?? false,
  });

  const ports = interfaceStats.map((stat) => shapePort(stat.port, stat.status, configByName.get(stat.port)));

  // Include configured ports the device hasn't reported telemetry for yet (e.g. offline device)
  for (const config of portConfigs) {
    if (!seen.has(config.name)) {
      ports.push(shapePort(config.name, "unknown", config));
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ports,
        // "switchport port-security" (TR only) — distinct from the IP-MAC-binding Port Security
        // feature, which every model supports. Mirrors getPoeSettings' legacyModeGlobal pattern.
        portSecuritySwitchportSupported: !!commands.portSecurity.setPortSecurityEnabled,
      },
      "Ports fetched"
    )
  );
});

interface PushField<V> {
  value: V;
  buildCommand: (target: InterfaceTarget) => { command: string; mode: "config" | "exec"; params?: Record<string, unknown> };
}

// PATCH /api/v1/device/:id/ports
// Body: { name } or { names: string[] } (bulk / interface-range) plus any of the settable
// fields below. All of them are pushed live to the device using the Pre-command
// interface-context mechanism (see commands/deviceCommands.ts):
//   - description/adminStatus/speed/duplex/flowControl/mtu/medium/sfpMode/autoneg
//     (CLI ref: "Configuring Ethernet Interface")
//   - portType (switchport mode access/trunk/hybrid), vlanId (access vlan / trunk native vlan /
//     hybrid PVID depending on portType), trunkAllowedVlan, hybridAllowedVlan, hybridUntaggedVlan
//     (CLI ref: "Configuring VLAN")
export const updatePort = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceParam = req.params.id;
  if (!deviceParam)
    return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));

  const access = await verifyDeviceAccess(req, deviceParam);
  if (!access.ok)
    return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
  const { device } = access;

  const body = req.body as {
    name?: unknown;
    names?: unknown;
    description?: unknown;
    portType?: unknown;
    vlanId?: unknown;
    adminStatus?: unknown;
    speed?: unknown;
    duplex?: unknown;
    flowControl?: unknown;
    mtu?: unknown;
    medium?: unknown;
    sfpMode?: unknown;
    autoneg?: unknown;
    trunkAllowedVlan?: unknown;
    hybridAllowedVlan?: unknown;
    hybridUntaggedVlan?: unknown;
    lacpPortPriority?: unknown;
    lacpTimeout?: unknown;
    poeEnabled?: unknown;
    poePriority?: unknown;
    poeMaxPower?: unknown;
    poeForceOn?: unknown;
    poeLegacyMode?: unknown;
    poePdDescription?: unknown;
    poePdDetectMode?: unknown;
    poePdDetectPeerIp?: unknown;
    poePdDetectInterval?: unknown;
    poePdDetectTimes?: unknown;
    portSecurityEnabled?: unknown;
    portSecurityAgingStatic?: unknown;
    portSecurityAgingTime?: unknown;
    portSecurityStickyMac?: unknown;
    portSecurityMaximum?: unknown;
    portSecurityViolationMode?: unknown;
    loopDetectEnabled?: unknown;
    loopDetectAction?: unknown;
    loopDetectVlans?: unknown;
    stpPriority?: unknown;
    stpPathCost?: unknown;
    stpEdgePort?: unknown;
    stpBpduGuard?: unknown;
  };

  // ─── Resolve target port(s) ────────────────────────────────────────────────
  let portNames: string[];
  if (Array.isArray(body.names) && body.names.length > 0) {
    if (!body.names.every((n) => typeof n === "string" && n.trim()))
      return res.status(400).json(new ApiResponse(400, {}, "names must be a non-empty array of strings"));
    portNames = (body.names as string[]).map((n) => n.trim());
  } else if (typeof body.name === "string" && body.name.trim()) {
    portNames = [body.name.trim()];
  } else {
    return res.status(400).json(new ApiResponse(400, {}, "name (or names) is required"));
  }

  let target: InterfaceTarget;
  if (portNames.length === 1) {
    target = { kind: "single", port: portNames[0]! };
  } else {
    const built = buildRangeSpec(portNames);
    if ("error" in built) return res.status(400).json(new ApiResponse(400, {}, built.error));
    target = { kind: "range", rangeSpec: built.rangeSpec };
  }

  // ─── Validate simple fields ─────────────────────────────────────────────────
  const { description, portType, vlanId, trunkAllowedVlan, hybridAllowedVlan, hybridUntaggedVlan } = body;
  if (portType !== undefined && !VALID_PORT_TYPES.includes(portType as PortType))
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `portType must be one of: ${VALID_PORT_TYPES.join(", ")}`));
  if (description !== undefined && description !== null && typeof description !== "string")
    return res.status(400).json(new ApiResponse(400, {}, "description must be a string or null"));
  if (typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH)
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`));
  if (
    vlanId !== undefined &&
    (typeof vlanId !== "number" || !Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094)
  )
    return res.status(400).json(new ApiResponse(400, {}, "vlanId must be an integer between 1 and 4094"));

  // ─── Validate live-push fields ──────────────────────────────────────────────
  const { adminStatus, speed, duplex, flowControl, mtu, medium, sfpMode, autoneg, lacpPortPriority, lacpTimeout, poeEnabled } = body;

  if (adminStatus !== undefined && !VALID_ADMIN_STATUSES.includes(adminStatus as AdminStatus))
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `adminStatus must be one of: ${VALID_ADMIN_STATUSES.join(", ")}`));
  if (speed !== undefined && !VALID_SPEEDS.includes(speed as Speed))
    return res.status(400).json(new ApiResponse(400, {}, `speed must be one of: ${VALID_SPEEDS.join(", ")}`));
  if (duplex !== undefined && !VALID_DUPLEXES.includes(duplex as Duplex))
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `duplex must be one of: ${VALID_DUPLEXES.join(", ")}`));
  if (flowControl !== undefined && !VALID_FLOW_CONTROLS.includes(flowControl as FlowControl))
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `flowControl must be one of: ${VALID_FLOW_CONTROLS.join(", ")}`));
  if (
    mtu !== undefined &&
    (typeof mtu !== "number" || !Number.isInteger(mtu) || mtu < MIN_MTU || mtu > MAX_MTU)
  )
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `mtu must be an integer between ${MIN_MTU} and ${MAX_MTU}`));
  if (medium !== undefined && !VALID_MEDIUMS.includes(medium as Medium))
    return res.status(400).json(new ApiResponse(400, {}, `medium must be one of: ${VALID_MEDIUMS.join(", ")}`));
  if (sfpMode !== undefined && !VALID_SFP_MODES.includes(sfpMode as SfpMode))
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `sfpMode must be one of: ${VALID_SFP_MODES.join(", ")}`));
  if (autoneg !== undefined && !VALID_AUTONEGS.includes(autoneg as Autoneg))
    return res.status(400).json(new ApiResponse(400, {}, `autoneg must be one of: ${VALID_AUTONEGS.join(", ")}`));
  if (
    lacpPortPriority !== undefined &&
    (typeof lacpPortPriority !== "number" ||
      !Number.isInteger(lacpPortPriority) ||
      lacpPortPriority < MIN_LACP_PRIORITY ||
      lacpPortPriority > MAX_LACP_PRIORITY)
  )
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `lacpPortPriority must be an integer between ${MIN_LACP_PRIORITY} and ${MAX_LACP_PRIORITY}`));
  if (lacpTimeout !== undefined && !VALID_LACP_TIMEOUTS.includes(lacpTimeout as LacpTimeout))
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `lacpTimeout must be one of: ${VALID_LACP_TIMEOUTS.join(", ")}`));
  if (poeEnabled !== undefined && typeof poeEnabled !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "poeEnabled must be a boolean"));

  // ─── Validate loop-detect / STP fields (TR models only) ────────────────────────
  const { loopDetectEnabled, loopDetectAction, loopDetectVlans, stpPriority, stpPathCost, stpEdgePort, stpBpduGuard } = body;
  const wantsLoopDetect = loopDetectEnabled !== undefined || loopDetectAction !== undefined || loopDetectVlans !== undefined;
  const wantsStp = stpPriority !== undefined || stpPathCost !== undefined || stpEdgePort !== undefined || stpBpduGuard !== undefined;
  const capabilities = getDeviceCapabilities(device.model);
  const commands = getDeviceCommands(device.model);
  if (wantsLoopDetect && !capabilities.loopDetection)
    return res.status(400).json(new ApiResponse(400, {}, `Loop-Detect is not supported on this device model (${device.model})`));
  if (wantsStp && !capabilities.stp)
    return res.status(400).json(new ApiResponse(400, {}, `STP is not supported on this device model (${device.model})`));

  // ─── Validate per-port PoE fields (TR models only — confirmed live) ────────────
  const { poePriority, poeMaxPower, poeForceOn, poeLegacyMode, poePdDescription } = body;
  if (poePriority !== undefined && !commands.poe.setPortPriority)
    return res.status(400).json(new ApiResponse(400, {}, `poePriority is not supported on this device model (${device.model})`));
  if (poeMaxPower !== undefined && !commands.poe.setPortMaxPower)
    return res.status(400).json(new ApiResponse(400, {}, `poeMaxPower is not supported on this device model (${device.model})`));
  if (poeForceOn !== undefined && (!commands.poe.setPortForceOn || !commands.poe.clearPortForce))
    return res.status(400).json(new ApiResponse(400, {}, `poeForceOn is not supported on this device model (${device.model})`));
  if (poeLegacyMode !== undefined && !commands.poe.setPortLegacyMode)
    return res.status(400).json(new ApiResponse(400, {}, `poeLegacyMode is per-device (not per-port) on this device model (${device.model})`));
  if (poePdDescription !== undefined && !commands.poe.setPortPdDescription)
    return res.status(400).json(new ApiResponse(400, {}, `poePdDescription is not supported on this device model (${device.model})`));

  if (poePriority !== undefined && !VALID_POE_PRIORITIES.includes(poePriority as PoePriority))
    return res.status(400).json(new ApiResponse(400, {}, `poePriority must be one of: ${VALID_POE_PRIORITIES.join(", ")}`));
  if (
    poeMaxPower !== undefined &&
    poeMaxPower !== null &&
    (typeof poeMaxPower !== "number" || !Number.isInteger(poeMaxPower) || poeMaxPower < MIN_POE_MAX_POWER || poeMaxPower > MAX_POE_MAX_POWER)
  )
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `poeMaxPower must be an integer between ${MIN_POE_MAX_POWER} and ${MAX_POE_MAX_POWER}, or null to reset`));
  if (poeForceOn !== undefined && typeof poeForceOn !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "poeForceOn must be a boolean"));
  if (poeLegacyMode !== undefined && typeof poeLegacyMode !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "poeLegacyMode must be a boolean"));
  if (poePdDescription !== undefined && poePdDescription !== null && typeof poePdDescription !== "string")
    return res.status(400).json(new ApiResponse(400, {}, "poePdDescription must be a string or null"));
  if (typeof poePdDescription === "string" && poePdDescription.length > 32)
    return res.status(400).json(new ApiResponse(400, {}, "poePdDescription must be at most 32 characters"));

  // ─── Validate PD-detect fields (TR models only — confirmed live) ───────────────
  const { poePdDetectMode, poePdDetectPeerIp, poePdDetectInterval, poePdDetectTimes } = body;
  const wantsPdDetectMode = poePdDetectMode !== undefined;
  const wantsPdDetectParams = poePdDetectInterval !== undefined || poePdDetectTimes !== undefined;
  if (wantsPdDetectMode && (!commands.poe.setPortPdDetectByFlow || !commands.poe.setPortPdDetectByPing || !commands.poe.clearPortPdDetectMode))
    return res.status(400).json(new ApiResponse(400, {}, `poePdDetectMode is not supported on this device model (${device.model})`));
  if (wantsPdDetectParams && (!commands.poe.setPortPdDetectParams || !commands.poe.clearPortPdDetectParams))
    return res.status(400).json(new ApiResponse(400, {}, `poePdDetectInterval/poePdDetectTimes are not supported on this device model (${device.model})`));

  if (poePdDetectMode !== undefined && !VALID_PD_DETECT_MODES.includes(poePdDetectMode as PdDetectMode))
    return res.status(400).json(new ApiResponse(400, {}, `poePdDetectMode must be one of: ${VALID_PD_DETECT_MODES.join(", ")}`));
  if (poePdDetectMode === "by-ping") {
    if (typeof poePdDetectPeerIp !== "string" || !IPV4_RE.test(poePdDetectPeerIp))
      return res.status(400).json(new ApiResponse(400, {}, "poePdDetectPeerIp must be a valid IPv4 address when poePdDetectMode is 'by-ping'"));
  } else if (poePdDetectPeerIp !== undefined) {
    return res.status(400).json(new ApiResponse(400, {}, "poePdDetectPeerIp only applies when poePdDetectMode is 'by-ping'"));
  }
  // The switch sets interval+times together in one command — require both or neither.
  if (wantsPdDetectParams && (poePdDetectInterval === undefined || poePdDetectTimes === undefined))
    return res.status(400).json(new ApiResponse(400, {}, "poePdDetectInterval and poePdDetectTimes must be set together"));
  if (
    poePdDetectInterval !== undefined &&
    (typeof poePdDetectInterval !== "number" ||
      !Number.isInteger(poePdDetectInterval) ||
      poePdDetectInterval < MIN_PD_DETECT_INTERVAL ||
      poePdDetectInterval > MAX_PD_DETECT_INTERVAL)
  )
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `poePdDetectInterval must be an integer between ${MIN_PD_DETECT_INTERVAL} and ${MAX_PD_DETECT_INTERVAL}`));
  if (
    poePdDetectTimes !== undefined &&
    (typeof poePdDetectTimes !== "number" ||
      !Number.isInteger(poePdDetectTimes) ||
      poePdDetectTimes < MIN_PD_DETECT_TIMES ||
      poePdDetectTimes > MAX_PD_DETECT_TIMES)
  )
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `poePdDetectTimes must be an integer between ${MIN_PD_DETECT_TIMES} and ${MAX_PD_DETECT_TIMES}`));

  // ─── Validate switchport port-security fields (TR models only — confirmed live) ─────
  const {
    portSecurityEnabled,
    portSecurityAgingStatic,
    portSecurityAgingTime,
    portSecurityStickyMac,
    portSecurityMaximum,
    portSecurityViolationMode,
  } = body;
  const wantsPortSecurity =
    portSecurityEnabled !== undefined ||
    portSecurityAgingStatic !== undefined ||
    portSecurityAgingTime !== undefined ||
    portSecurityStickyMac !== undefined ||
    portSecurityMaximum !== undefined ||
    portSecurityViolationMode !== undefined;
  if (wantsPortSecurity) {
    if (portSecurityEnabled !== undefined && !commands.portSecurity.setPortSecurityEnabled)
      return res.status(400).json(new ApiResponse(400, {}, `portSecurityEnabled is not supported on this device model (${device.model})`));
    if (portSecurityAgingStatic !== undefined && !commands.portSecurity.setPortSecurityAgingStatic)
      return res.status(400).json(new ApiResponse(400, {}, `portSecurityAgingStatic is not supported on this device model (${device.model})`));
    if (portSecurityAgingTime !== undefined && !commands.portSecurity.setPortSecurityAgingTime)
      return res.status(400).json(new ApiResponse(400, {}, `portSecurityAgingTime is not supported on this device model (${device.model})`));
    if (portSecurityStickyMac !== undefined && !commands.portSecurity.setPortSecurityStickyMac)
      return res.status(400).json(new ApiResponse(400, {}, `portSecurityStickyMac is not supported on this device model (${device.model})`));
    if (portSecurityMaximum !== undefined && !commands.portSecurity.setPortSecurityMaximum)
      return res.status(400).json(new ApiResponse(400, {}, `portSecurityMaximum is not supported on this device model (${device.model})`));
    if (portSecurityViolationMode !== undefined && !commands.portSecurity.setPortSecurityViolation)
      return res.status(400).json(new ApiResponse(400, {}, `portSecurityViolationMode is not supported on this device model (${device.model})`));
  }

  if (portSecurityEnabled !== undefined && typeof portSecurityEnabled !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "portSecurityEnabled must be a boolean"));
  if (portSecurityAgingStatic !== undefined && typeof portSecurityAgingStatic !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "portSecurityAgingStatic must be a boolean"));
  if (
    portSecurityAgingTime !== undefined &&
    portSecurityAgingTime !== null &&
    (typeof portSecurityAgingTime !== "number" ||
      !Number.isInteger(portSecurityAgingTime) ||
      portSecurityAgingTime < MIN_PORT_SECURITY_AGING_TIME ||
      portSecurityAgingTime > MAX_PORT_SECURITY_AGING_TIME)
  )
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          {},
          `portSecurityAgingTime must be an integer between ${MIN_PORT_SECURITY_AGING_TIME} and ${MAX_PORT_SECURITY_AGING_TIME}, or null to reset`
        )
      );
  if (portSecurityStickyMac !== undefined && typeof portSecurityStickyMac !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "portSecurityStickyMac must be a boolean"));
  if (
    portSecurityMaximum !== undefined &&
    portSecurityMaximum !== null &&
    (typeof portSecurityMaximum !== "number" ||
      !Number.isInteger(portSecurityMaximum) ||
      portSecurityMaximum < MIN_PORT_SECURITY_MAXIMUM ||
      portSecurityMaximum > MAX_PORT_SECURITY_MAXIMUM)
  )
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          {},
          `portSecurityMaximum must be an integer between ${MIN_PORT_SECURITY_MAXIMUM} and ${MAX_PORT_SECURITY_MAXIMUM}, or null to reset`
        )
      );
  if (
    portSecurityViolationMode !== undefined &&
    portSecurityViolationMode !== null &&
    !VALID_PORT_SECURITY_VIOLATIONS.includes(portSecurityViolationMode as PortSecurityViolation)
  )
    return res
      .status(400)
      .json(new ApiResponse(400, {}, `portSecurityViolationMode must be one of: ${VALID_PORT_SECURITY_VIOLATIONS.join(", ")}, or null to reset`));

  if (loopDetectEnabled !== undefined && typeof loopDetectEnabled !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "loopDetectEnabled must be a boolean"));
  if (loopDetectAction !== undefined && !VALID_LOOP_ACTIONS.includes(loopDetectAction as LoopAction))
    return res.status(400).json(new ApiResponse(400, {}, `loopDetectAction must be one of: ${VALID_LOOP_ACTIONS.join(", ")}`));
  if (loopDetectVlans !== undefined && loopDetectVlans !== null && typeof loopDetectVlans !== "string")
    return res.status(400).json(new ApiResponse(400, {}, "loopDetectVlans must be a string or null"));
  if (typeof loopDetectVlans === "string") {
    const parsedLoopVlans = parseVlanList(loopDetectVlans);
    if ("error" in parsedLoopVlans) return res.status(400).json(new ApiResponse(400, {}, `loopDetectVlans: ${parsedLoopVlans.error}`));
  }
  if (
    stpPriority !== undefined &&
    (typeof stpPriority !== "number" || !Number.isInteger(stpPriority) || stpPriority < 0 || stpPriority > 240)
  )
    return res.status(400).json(new ApiResponse(400, {}, "stpPriority must be an integer between 0 and 240"));
  if (
    stpPathCost !== undefined &&
    stpPathCost !== null &&
    (typeof stpPathCost !== "number" || !Number.isInteger(stpPathCost) || stpPathCost < 1 || stpPathCost > 200000000)
  )
    return res.status(400).json(new ApiResponse(400, {}, "stpPathCost must be an integer between 1 and 200000000, or null to reset"));
  if (stpEdgePort !== undefined && stpEdgePort !== null && !VALID_STP_EDGE_MODES.includes(stpEdgePort as StpEdgeMode))
    return res.status(400).json(new ApiResponse(400, {}, `stpEdgePort must be one of: ${VALID_STP_EDGE_MODES.join(", ")}, or null`));
  if (stpBpduGuard !== undefined && typeof stpBpduGuard !== "boolean")
    return res.status(400).json(new ApiResponse(400, {}, "stpBpduGuard must be a boolean"));

  // Fetch existing config once — used both for the speed/duplex cross-check below and for
  // resolving which switchport command vlanId/allowed-list fields map to.
  const existingPorts = await prisma.port.findMany({ where: { deviceId: device.id, name: { in: portNames } } });
  const firstExisting = existingPorts[0];

  // Cross-field: "You cannot configure half-duplex mode for interfaces operating at 1000 Mbps"
  // (CLI ref: "Configuring Interface Duplex Mode"). Fall back to the first target port's stored
  // value for whichever of speed/duplex isn't part of this request.
  const effectiveSpeed = (speed as Speed | undefined) ?? firstExisting?.speed ?? "auto";
  const effectiveDuplex = (duplex as Duplex | undefined) ?? firstExisting?.duplex ?? "auto";
  if (effectiveDuplex === "half" && effectiveSpeed === "1000")
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "half duplex is not valid at 1000 Mbps"));

  // ─── Validate VLAN-list fields (trunk/hybrid allowed list, hybrid untagged list) ───────
  // CLI ref: "Only created VLANs can be added to the Allowed VLAN list" — every specific ID
  // mentioned (not "all"/"none") must already exist as a VLAN on this device. "The Untagged
  // VLAN list must be in the Allowed VLAN list of the Hybrid port."
  const effectivePortType = (portType as PortType | undefined) ?? firstExisting?.portType ?? "access";

  if (trunkAllowedVlan !== undefined && effectivePortType !== "trunk")
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "trunkAllowedVlan only applies when portType is 'trunk'"));
  if (
    (hybridAllowedVlan !== undefined || hybridUntaggedVlan !== undefined) &&
    effectivePortType !== "hybrid"
  )
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "hybridAllowedVlan/hybridUntaggedVlan only apply when portType is 'hybrid'"));

  const deviceVlans = await prisma.vlan.findMany({ where: { deviceId: device.id } });
  const validVlanIds = new Set(deviceVlans.map((v) => v.vlanId));

  const parsedTrunkAllowed =
    typeof trunkAllowedVlan === "string" ? parseVlanList(trunkAllowedVlan) : undefined;
  if (parsedTrunkAllowed && "error" in parsedTrunkAllowed)
    return res.status(400).json(new ApiResponse(400, {}, `trunkAllowedVlan: ${parsedTrunkAllowed.error}`));
  if (parsedTrunkAllowed && "value" in parsedTrunkAllowed && parsedTrunkAllowed.value.kind === "ids") {
    const missing = parsedTrunkAllowed.value.ids.filter((id) => !validVlanIds.has(id));
    if (missing.length > 0)
      return res
        .status(400)
        .json(new ApiResponse(400, {}, `trunkAllowedVlan references VLAN(s) that don't exist on this device: ${missing.join(", ")}`));
  }

  const parsedHybridAllowed =
    typeof hybridAllowedVlan === "string" ? parseVlanList(hybridAllowedVlan) : undefined;
  if (parsedHybridAllowed && "error" in parsedHybridAllowed)
    return res.status(400).json(new ApiResponse(400, {}, `hybridAllowedVlan: ${parsedHybridAllowed.error}`));
  if (parsedHybridAllowed && "value" in parsedHybridAllowed && parsedHybridAllowed.value.kind === "ids") {
    const missing = parsedHybridAllowed.value.ids.filter((id) => !validVlanIds.has(id));
    if (missing.length > 0)
      return res
        .status(400)
        .json(new ApiResponse(400, {}, `hybridAllowedVlan references VLAN(s) that don't exist on this device: ${missing.join(", ")}`));
  }

  const parsedHybridUntagged =
    typeof hybridUntaggedVlan === "string" ? parseVlanList(hybridUntaggedVlan) : undefined;
  if (parsedHybridUntagged && "error" in parsedHybridUntagged)
    return res.status(400).json(new ApiResponse(400, {}, `hybridUntaggedVlan: ${parsedHybridUntagged.error}`));
  if (parsedHybridUntagged && "value" in parsedHybridUntagged && parsedHybridUntagged.value.kind === "ids") {
    const missing = parsedHybridUntagged.value.ids.filter((id) => !validVlanIds.has(id));
    if (missing.length > 0)
      return res
        .status(400)
        .json(new ApiResponse(400, {}, `hybridUntaggedVlan references VLAN(s) that don't exist on this device: ${missing.join(", ")}`));

    // Subset check against the effective allowed list (the one in this request, else stored).
    const effectiveAllowedSpec = parsedHybridAllowed ? parsedHybridAllowed.spec : firstExisting?.hybridAllowedVlan ?? "all";
    const effectiveAllowed = parseVlanList(effectiveAllowedSpec);
    if ("value" in effectiveAllowed) {
      if (effectiveAllowed.value.kind === "none") {
        return res
          .status(400)
          .json(new ApiResponse(400, {}, "hybridUntaggedVlan must be empty when the allowed VLAN list is 'none'"));
      }
      if (effectiveAllowed.value.kind === "ids") {
        const allowedSet = new Set(effectiveAllowed.value.ids);
        const notAllowed = parsedHybridUntagged.value.ids.filter((id) => !allowedSet.has(id));
        if (notAllowed.length > 0)
          return res
            .status(400)
            .json(
              new ApiResponse(
                400,
                {},
                `hybridUntaggedVlan must be a subset of the allowed VLAN list — not allowed: ${notAllowed.join(", ")}`
              )
            );
      }
    }
  }

  const pushFields: Record<string, PushField<unknown>> = {};
  if (adminStatus !== undefined)
    pushFields.adminStatus = { value: adminStatus, buildCommand: (t) => commands.port.setAdminStatus(t, adminStatus as AdminStatus) };
  if (speed !== undefined)
    pushFields.speed = { value: speed, buildCommand: (t) => commands.port.setSpeed(t, speed as Speed) };
  if (duplex !== undefined)
    pushFields.duplex = { value: duplex, buildCommand: (t) => commands.port.setDuplex(t, duplex as Duplex) };
  if (typeof description === "string")
    pushFields.description = { value: description, buildCommand: (t) => commands.port.setDescription(t, description) };
  if (flowControl !== undefined)
    pushFields.flowControl = { value: flowControl, buildCommand: (t) => commands.port.setFlowControl(t, flowControl as FlowControl) };
  if (mtu !== undefined)
    pushFields.mtu = { value: mtu, buildCommand: (t) => commands.port.setMtu(t, mtu as number) };
  if (medium !== undefined)
    pushFields.medium = { value: medium, buildCommand: (t) => commands.port.setMedium(t, medium as Medium) };
  if (sfpMode !== undefined)
    pushFields.sfpMode = { value: sfpMode, buildCommand: (t) => commands.port.setSfpMode(t, sfpMode as SfpMode) };
  if (autoneg !== undefined)
    pushFields.autoneg = { value: autoneg, buildCommand: (t) => commands.port.setAutoneg(t, autoneg as Autoneg) };
  if (portType !== undefined)
    pushFields.portType = { value: portType, buildCommand: (t) => commands.port.setSwitchportMode(t, portType as PortType) };
  if (vlanId !== undefined) {
    pushFields.vlanId = {
      value: vlanId,
      buildCommand: (t) => {
        if (effectivePortType === "trunk") return commands.port.setTrunkNativeVlan(t, vlanId as number);
        if (effectivePortType === "hybrid") return commands.port.setHybridVlan(t, vlanId as number);
        return commands.port.setAccessVlan(t, vlanId as number);
      },
    };
  }
  if (parsedTrunkAllowed && "spec" in parsedTrunkAllowed)
    pushFields.trunkAllowedVlan = {
      value: parsedTrunkAllowed.spec,
      buildCommand: (t) => commands.port.setTrunkAllowedVlan(t, parsedTrunkAllowed.spec),
    };
  if (parsedHybridAllowed && "spec" in parsedHybridAllowed)
    pushFields.hybridAllowedVlan = {
      value: parsedHybridAllowed.spec,
      buildCommand: (t) => commands.port.setHybridAllowedVlan(t, parsedHybridAllowed.spec),
    };
  if (parsedHybridUntagged && "spec" in parsedHybridUntagged) {
    if (parsedHybridUntagged.value.kind === "none") {
      // No "none" keyword for this command (confirmed live) — clear via the "no" form using
      // whatever is currently stored, or skip entirely if it's already empty.
      const existingUntagged = firstExisting?.hybridUntaggedVlan ?? "";
      if (existingUntagged) {
        pushFields.hybridUntaggedVlan = {
          value: "",
          buildCommand: (t) => commands.port.clearHybridUntaggedVlan(t, existingUntagged),
        };
      }
    } else {
      pushFields.hybridUntaggedVlan = {
        value: parsedHybridUntagged.spec,
        buildCommand: (t) => commands.port.setHybridUntaggedVlan(t, parsedHybridUntagged.spec),
      };
    }
  }
  if (lacpPortPriority !== undefined)
    pushFields.lacpPortPriority = {
      value: lacpPortPriority,
      buildCommand: (t) => commands.port.setLacpPortPriority(t, lacpPortPriority as number),
    };
  if (lacpTimeout !== undefined)
    pushFields.lacpTimeout = {
      value: lacpTimeout,
      buildCommand: (t) => commands.port.setLacpTimeout(t, lacpTimeout as LacpTimeout),
    };
  if (poeEnabled !== undefined)
    pushFields.poeEnabled = {
      value: poeEnabled,
      buildCommand: (t) => commands.poe.setPortEnabled(t, poeEnabled as boolean),
    };
  if (poePriority !== undefined)
    pushFields.poePriority = {
      value: poePriority,
      buildCommand: (t) => commands.poe.setPortPriority!(t, poePriority as PoePriority),
    };
  if (poeMaxPower !== undefined)
    pushFields.poeMaxPower = {
      value: poeMaxPower,
      buildCommand: (t) => commands.poe.setPortMaxPower!(t, poeMaxPower as number | null),
    };
  if (poeForceOn !== undefined)
    pushFields.poeForceOn = {
      value: poeForceOn,
      buildCommand: (t) =>
        poeForceOn ? commands.poe.setPortForceOn!(t) : commands.poe.clearPortForce!(t),
    };
  if (poeLegacyMode !== undefined)
    pushFields.poeLegacyMode = {
      value: poeLegacyMode,
      buildCommand: (t) => commands.poe.setPortLegacyMode!(t, poeLegacyMode as boolean),
    };
  if (poePdDescription !== undefined)
    pushFields.poePdDescription = {
      value: poePdDescription,
      buildCommand: (t) => commands.poe.setPortPdDescription!(t, poePdDescription as string | null),
    };
  if (poePdDetectMode !== undefined)
    // value carries both mode + peerIp together — expanded into two DB columns after the push
    // loop below (see the poePdDetectMode/peerIp transform near dbData).
    pushFields.poePdDetectMode = {
      value: { mode: poePdDetectMode, peerIp: poePdDetectMode === "by-ping" ? (poePdDetectPeerIp as string) : null },
      buildCommand: (t) => {
        if (poePdDetectMode === "none") return commands.poe.clearPortPdDetectMode!(t);
        if (poePdDetectMode === "by-ping") return commands.poe.setPortPdDetectByPing!(t, poePdDetectPeerIp as string);
        return commands.poe.setPortPdDetectByFlow!(t);
      },
    };
  if (wantsPdDetectParams)
    // value carries both interval + times together — the switch sets them in one command
    // (see commands/poe/tr.ts) — expanded into two DB columns after the push loop below.
    pushFields.poePdDetectParams = {
      value: { interval: poePdDetectInterval, times: poePdDetectTimes },
      buildCommand: (t) => commands.poe.setPortPdDetectParams!(t, poePdDetectInterval as number, poePdDetectTimes as number),
    };
  if (portSecurityEnabled !== undefined)
    pushFields.portSecurityEnabled = {
      value: portSecurityEnabled,
      buildCommand: (t) => commands.portSecurity.setPortSecurityEnabled!(t, portSecurityEnabled as boolean),
    };
  if (portSecurityAgingStatic !== undefined)
    pushFields.portSecurityAgingStatic = {
      value: portSecurityAgingStatic,
      buildCommand: (t) => commands.portSecurity.setPortSecurityAgingStatic!(t, portSecurityAgingStatic as boolean),
    };
  if (portSecurityAgingTime !== undefined)
    pushFields.portSecurityAgingTime = {
      value: portSecurityAgingTime,
      buildCommand: (t) => commands.portSecurity.setPortSecurityAgingTime!(t, portSecurityAgingTime as number | null),
    };
  if (portSecurityStickyMac !== undefined)
    pushFields.portSecurityStickyMac = {
      value: portSecurityStickyMac,
      buildCommand: (t) => commands.portSecurity.setPortSecurityStickyMac!(t, portSecurityStickyMac as boolean),
    };
  if (portSecurityMaximum !== undefined)
    pushFields.portSecurityMaximum = {
      value: portSecurityMaximum,
      buildCommand: (t) => commands.portSecurity.setPortSecurityMaximum!(t, portSecurityMaximum as number | null),
    };
  if (portSecurityViolationMode !== undefined)
    pushFields.portSecurityViolationMode = {
      value: portSecurityViolationMode,
      buildCommand: (t) =>
        commands.portSecurity.setPortSecurityViolation!(t, portSecurityViolationMode as PortSecurityViolation | null),
    };
  if (loopDetectEnabled !== undefined)
    pushFields.loopDetectEnabled = {
      value: loopDetectEnabled,
      buildCommand: (t) => commands.loopDetect!.setPortEnabled(t, loopDetectEnabled as boolean),
    };
  if (loopDetectAction !== undefined)
    pushFields.loopDetectAction = {
      value: loopDetectAction,
      buildCommand: (t) => commands.loopDetect!.setPortAction(t, loopDetectAction as LoopAction),
    };
  if (loopDetectVlans !== undefined)
    pushFields.loopDetectVlans = {
      value: loopDetectVlans,
      buildCommand: (t) => commands.loopDetect!.setPortVlans(t, loopDetectVlans as string | null),
    };
  if (stpPriority !== undefined)
    pushFields.stpPriority = {
      value: stpPriority,
      buildCommand: (t) => commands.stp!.setPortPriority(t, stpPriority as number),
    };
  if (stpPathCost !== undefined)
    pushFields.stpPathCost = {
      value: stpPathCost,
      buildCommand: (t) => commands.stp!.setPortPathCost(t, stpPathCost as number | null),
    };
  if (stpEdgePort !== undefined)
    pushFields.stpEdgePort = {
      value: stpEdgePort,
      buildCommand: (t) =>
        commands.stp!.setPortEdgeMode(
          t,
          stpEdgePort as StpEdgeMode | null,
          (firstExisting?.stpEdgePort as StpEdgeMode | null) ?? null
        ),
    };
  if (stpBpduGuard !== undefined)
    pushFields.stpBpduGuard = {
      value: stpBpduGuard,
      buildCommand: (t) => commands.stp!.setPortBpduGuard(t, stpBpduGuard as boolean),
    };

  const hasPushFields = Object.keys(pushFields).length > 0;
  if (hasPushFields && device.status !== "online")
    return res
      .status(409)
      .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure ports`));

  // ─── Push each requested field to the device, one MQTT round-trip per field ───
  const results: Record<string, { applied: boolean; requestId?: string | undefined; message?: string }> = {};
  const appliedData: Record<string, unknown> = {};
  let anyPushFailed = false;

  for (const [field, spec] of Object.entries(pushFields)) {
    try {
      const { requestId, response } = await runDeviceCommand(device, {
        ...spec.buildCommand(target),
        logParams: { ports: portNames, field, value: spec.value },
      });
      if (response.status !== 0) {
        results[field] = { applied: false, requestId, message: response.message || "Switch rejected the command" };
        anyPushFailed = true;
      } else {
        results[field] = { applied: true, requestId };
        appliedData[field] = spec.value;
      }
    } catch (err) {
      const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
      results[field] = { applied: false, requestId, message: "Device did not respond in time" };
      anyPushFailed = true;
    }
  }

  // ─── Persist: only fields the switch actually confirmed ────────────────────
  const dbData: Record<string, unknown> = { ...appliedData };
  // poePdDetectMode/poePdDetectParams each push one command but touch two DB columns —
  // expand their paired object value into the real column names here.
  if ("poePdDetectMode" in dbData) {
    const { mode, peerIp } = dbData.poePdDetectMode as { mode: PdDetectMode; peerIp: string | null };
    dbData.poePdDetectMode = mode === "none" ? null : mode;
    dbData.poePdDetectPeerIp = peerIp;
  }
  if ("poePdDetectParams" in dbData) {
    const { interval, times } = dbData.poePdDetectParams as { interval: number; times: number };
    delete dbData.poePdDetectParams;
    dbData.poePdDetectInterval = interval;
    dbData.poePdDetectTimes = times;
  }
  if (hasPushFields) dbData.deviceConfirmed = !anyPushFailed;

  const updatedPorts = await Promise.all(
    portNames.map((name) =>
      prisma.port.upsert({
        where: { deviceId_name: { deviceId: device.id, name } },
        create: {
          deviceId: device.id,
          name,
          description: (dbData.description as string | null | undefined) ?? null,
          portType: (dbData.portType as PortType | undefined) ?? "access",
          vlanId: (dbData.vlanId as number | undefined) ?? 1,
          adminStatus: (dbData.adminStatus as AdminStatus | undefined) ?? "up",
          speed: (dbData.speed as Speed | undefined) ?? "auto",
          duplex: (dbData.duplex as Duplex | undefined) ?? "auto",
          flowControl: (dbData.flowControl as FlowControl | undefined) ?? "off",
          mtu: (dbData.mtu as number | undefined) ?? 1500,
          medium: (dbData.medium as Medium | undefined) ?? "copper",
          sfpMode: (dbData.sfpMode as SfpMode | undefined) ?? null,
          autoneg: (dbData.autoneg as Autoneg | undefined) ?? "on",
          trunkAllowedVlan: (dbData.trunkAllowedVlan as string | undefined) ?? "all",
          hybridAllowedVlan: (dbData.hybridAllowedVlan as string | undefined) ?? "all",
          hybridUntaggedVlan: (dbData.hybridUntaggedVlan as string | undefined) ?? "",
          lacpPortPriority: (dbData.lacpPortPriority as number | undefined) ?? 32768,
          lacpTimeout: (dbData.lacpTimeout as LacpTimeout | undefined) ?? "long",
          poeEnabled: (dbData.poeEnabled as boolean | undefined) ?? true,
          poePriority: (dbData.poePriority as PoePriority | undefined) ?? "low",
          poeMaxPower: (dbData.poeMaxPower as number | null | undefined) ?? null,
          poeForceOn: (dbData.poeForceOn as boolean | undefined) ?? false,
          poeLegacyMode: (dbData.poeLegacyMode as boolean | undefined) ?? false,
          poePdDescription: (dbData.poePdDescription as string | null | undefined) ?? null,
          poePdDetectMode: (dbData.poePdDetectMode as string | null | undefined) ?? null,
          poePdDetectPeerIp: (dbData.poePdDetectPeerIp as string | null | undefined) ?? null,
          poePdDetectInterval: (dbData.poePdDetectInterval as number | null | undefined) ?? null,
          poePdDetectTimes: (dbData.poePdDetectTimes as number | null | undefined) ?? null,
          loopDetectEnabled: (dbData.loopDetectEnabled as boolean | undefined) ?? false,
          loopDetectAction: (dbData.loopDetectAction as LoopAction | undefined) ?? "alarm",
          loopDetectVlans: (dbData.loopDetectVlans as string | null | undefined) ?? null,
          stpPriority: (dbData.stpPriority as number | undefined) ?? 128,
          stpPathCost: (dbData.stpPathCost as number | null | undefined) ?? null,
          stpEdgePort: (dbData.stpEdgePort as StpEdgeMode | null | undefined) ?? null,
          stpBpduGuard: (dbData.stpBpduGuard as boolean | undefined) ?? false,
          portSecurityEnabled: (dbData.portSecurityEnabled as boolean | undefined) ?? false,
          portSecurityAgingStatic: (dbData.portSecurityAgingStatic as boolean | undefined) ?? false,
          portSecurityAgingTime: (dbData.portSecurityAgingTime as number | null | undefined) ?? null,
          portSecurityStickyMac: (dbData.portSecurityStickyMac as boolean | undefined) ?? false,
          portSecurityMaximum: (dbData.portSecurityMaximum as number | null | undefined) ?? null,
          portSecurityViolationMode: (dbData.portSecurityViolationMode as string | null | undefined) ?? null,
          deviceConfirmed: (dbData.deviceConfirmed as boolean | undefined) ?? false,
        },
        update: dbData,
      })
    )
  );

  const statusCode = anyPushFailed ? 422 : 200;
  return res
    .status(statusCode)
    .json(
      new ApiResponse(
        statusCode,
        { ports: updatedPorts, results },
        anyPushFailed ? "Some fields were rejected by the device" : "Port configuration saved"
      )
    );
});

// Groups port names into an "interface range" spec. CLI ref: "Configuring Interface Range
// Mode" — up to five comma-separated ranges, all of the same port type, e.g.
// "interface range gigabitEthernet 0/1-4, gigabitEthernet 0/9-12".
// NOTE: the doc's own example inserts a space before the unit/slot digits for the *range*
// form specifically (unlike the single-port "interface gigabitEthernet0/1" form elsewhere in
// the same document) — reproduced literally here. This exact spacing has not been separately
// confirmed live; only the single-port Pre-command shape has. Verify before relying on bulk
// edits in production.
const PORT_NAME_RE = /^([a-zA-Z]+)(\d+)\/(\d+)$/;

const buildRangeSpec = (names: string[]): { rangeSpec: string } | { error: string } => {
  const parsed = names.map((name) => ({ name, match: name.match(PORT_NAME_RE) }));
  const unparsable = parsed.find((p) => !p.match);
  if (unparsable) return { error: `Cannot parse port name for bulk range: ${unparsable.name}` };

  const ports = parsed.map((p) => ({
    prefix: p.match![1]!,
    unit: Number(p.match![2]),
    slot: Number(p.match![3]),
  }));

  const prefixes = new Set(ports.map((p) => p.prefix));
  if (prefixes.size > 1)
    return { error: "All ports in a bulk edit must be the same interface type" };

  const byUnit = new Map<number, number[]>();
  for (const p of ports) {
    const list = byUnit.get(p.unit) ?? [];
    list.push(p.slot);
    byUnit.set(p.unit, list);
  }

  const groups: string[] = [];
  const prefix = ports[0]!.prefix;
  for (const [unit, slots] of [...byUnit.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...new Set(slots)].sort((a, b) => a - b);
    let runStart = sorted[0]!;
    let prev = sorted[0]!;
    const flush = (end: number) => {
      groups.push(runStart === end ? `${prefix} ${unit}/${runStart}` : `${prefix} ${unit}/${runStart}-${end}`);
    };
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i]!;
      if (cur !== prev + 1) {
        flush(prev);
        runStart = cur;
      }
      prev = cur;
    }
    flush(prev);
  }

  if (groups.length > 5)
    return { error: "A bulk edit can span at most five port ranges" };

  return { rangeSpec: groups.join(", ") };
};
