import prisma from "../../db/client.js";
import { getDeviceCommands, getDeviceCapabilities } from "../../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../deviceCommand.js";
import { parseMacTable, normalizeMac } from "./macTableParser.js";
import { parseLldpNeighbors } from "./lldpParser.js";

/*
  Periodically refreshes each online switch's MAC table snapshot (MacEntry) by sending the
  READ-ONLY "show mac-address-table" command over the existing request/response pipeline.

  Safety: this poller only ever issues exec-mode "show" commands. It never enters config mode,
  never touches VLAN 1, never touches the uplink port — it only reads what the switch already
  knows. Interval and staleness are conservative so the switch isn't spammed.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000;
// Entries not re-seen within this window are dropped (cable unplugged / host gone).
const STALE_AFTER_MS = 20 * 60 * 1000;
// A "show mac-address-table" on a busy uplink can be long; give the switch more than the
// default 15s.
const COMMAND_TIMEOUT_MS = 30 * 1000;

// LLDP runs on its own, longer, env-configurable cycle — neighbour relationships change far
// less often than a MAC table, and this is a second command round-trip per switch, so it's
// kept independent instead of riding the 5-min MAC poll.
const LLDP_POLL_INTERVAL_MS = Number(process.env.LLDP_POLL_INTERVAL_MS) || 10 * 60 * 1000;
const LLDP_COMMAND_TIMEOUT_MS = 30 * 1000;
// A Neighbor row is only ever dropped once it's missing from a *successful* poll of that same
// device AND has been stale for this long — several missed cycles' worth, not one. This is a
// floor under the neighbour's own advertised TTL (see refreshDeviceLldpNeighbors), so a
// neighbour that advertised a short TTL still can't be evicted on a single blip.
const LLDP_MIN_STALE_MS = 3 * LLDP_POLL_INTERVAL_MS;

let timer: NodeJS.Timeout | null = null;
let running = false;
let lldpTimer: NodeJS.Timeout | null = null;
let lldpRunning = false;

export const refreshDeviceMacTable = async (device: {
  id: string;
  serialNumber: string;
  model: string;
}): Promise<{ rows: number }> => {
  const commands = getDeviceCommands(device.model);
  const { response } = await runDeviceCommand(
    device,
    { ...commands.topology.showMacTable(), logParams: { source: "topologyPoller" } },
    COMMAND_TIMEOUT_MS,
  );

  if (response.status !== 0 || typeof response.data !== "string") {
    throw new Error(`show mac-address-table failed: status ${response.status} ${response.message ?? ""}`);
  }

  const rows = parseMacTable(response.data);
  const now = new Date();

  // Upsert in a single transaction so a reader never sees a half-refreshed table.
  await prisma.$transaction([
    ...rows.map((r) =>
      prisma.macEntry.upsert({
        where: {
          deviceId_port_mac_vlanId: { deviceId: device.id, port: r.port, mac: r.mac, vlanId: r.vlanId },
        },
        create: {
          deviceId: device.id,
          port: r.port,
          mac: r.mac,
          vlanId: r.vlanId,
          type: r.type,
          learnedAt: r.learnedAt,
          firstSeen: now,
          lastSeen: now,
        },
        update: { type: r.type, learnedAt: r.learnedAt, lastSeen: now },
      }),
    ),
    prisma.macEntry.deleteMany({
      where: { deviceId: device.id, lastSeen: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
    }),
  ]);

  return { rows: rows.length };
};

// Sends the READ-ONLY "show lldp neighbors" command (one request covers every interface) and
// upserts the results into Neighbor. Matches each discovered neighbour to a managed Device by
// chassis MAC or management IP ONLY — never by system name, which is routinely a generic
// string like "Switch" and can't reliably identify a specific device.
export const refreshDeviceLldpNeighbors = async (device: {
  id: string;
  serialNumber: string;
  model: string;
}): Promise<{ rows: number }> => {
  const commands = getDeviceCommands(device.model);
  const { response } = await runDeviceCommand(
    device,
    { ...commands.topology.showLldpNeighbors(), logParams: { source: "topologyPoller:lldp" } },
    LLDP_COMMAND_TIMEOUT_MS,
  );

  if (response.status !== 0 || typeof response.data !== "string") {
    throw new Error(`show lldp neighbors failed: status ${response.status} ${response.message ?? ""}`);
  }

  const rows = parseLldpNeighbors(response.data);

  // Zero recognizable entries is NOT proof the neighbour table is empty: it may be an error
  // banner, "LLDP not enabled", truncated/garbled text — or a blank response. Until the switch's
  // real empty-table output is confirmed and explicitly recognized, treat every such response as
  // inconclusive: skip BOTH the upsert and the stale cleanup below, and keep what we have.
  if (rows.length === 0) {
    const text = response.data.trim();
    console.warn(
      text === ""
        ? `[topology] ${device.serialNumber}: show lldp neighbors returned a blank response — keeping existing neighbours`
        : `[topology] ${device.serialNumber}: show lldp neighbors returned ${text.length} chars with no recognizable neighbour entries — keeping existing neighbours. Output starts: ${JSON.stringify(text.slice(0, 120))}`,
    );
    return { rows: 0 };
  }

  const now = new Date();

  const managedDevices = await prisma.device.findMany({
    where: { OR: [{ macAddress: { not: null } }, { ipAddress: { not: null } }] },
    select: { id: true, macAddress: true, ipAddress: true },
  });
  const byMac = new Map(
    managedDevices
      .map((d) => [d.macAddress ? normalizeMac(d.macAddress) : null, d.id] as const)
      .filter((e): e is [string, string] => e[0] !== null),
  );
  const byIp = new Map(
    managedDevices
      .map((d) => [d.ipAddress, d.id] as const)
      .filter((e): e is [string, string] => e[0] !== null),
  );

  // Upsert in a single transaction so a reader never sees a half-refreshed set of neighbours.
  await prisma.$transaction(
    rows.map((r) => {
      const remoteDeviceId =
        (r.remoteChassisId ? byMac.get(r.remoteChassisId) : undefined) ??
        (r.remoteMgmtIp ? byIp.get(r.remoteMgmtIp) : undefined) ??
        null;
      const shared = {
        remoteChassisId: r.remoteChassisId,
        remoteSystemName: r.remoteSystemName,
        remotePort: r.remotePort,
        remoteMgmtIp: r.remoteMgmtIp,
        remoteDescription: r.remoteDescription,
        remoteDeviceId,
        ttlSeconds: r.ttlSeconds,
        lastSeen: now,
      };
      return prisma.neighbor.upsert({
        where: { deviceId_localPort: { deviceId: device.id, localPort: r.localPort } },
        create: { deviceId: device.id, localPort: r.localPort, firstSeen: now, ...shared },
        update: shared,
      });
    }),
  );

  // Stale handling: a port this device no longer reports a neighbour on is only dropped once
  // it's outlived BOTH its own last-advertised TTL (with a safety multiplier) AND the floor
  // above — so one missed cycle, or a short-TTL neighbour blinking once, is never enough.
  // Rows for OTHER devices are untouched, and if this call throws before reaching here (failed
  // poll), nothing below ever runs — a failed/timed-out poll deletes nothing.
  const reportedPorts = new Set(rows.map((r) => r.localPort));
  const existing = await prisma.neighbor.findMany({
    where: { deviceId: device.id },
    select: { localPort: true, lastSeen: true, ttlSeconds: true },
  });
  const staleLocalPorts = existing
    .filter((n) => !reportedPorts.has(n.localPort))
    .filter((n) => {
      const ageMs = now.getTime() - n.lastSeen.getTime();
      const ttlGraceMs = n.ttlSeconds ? n.ttlSeconds * 1000 * 3 : 0;
      return ageMs > Math.max(LLDP_MIN_STALE_MS, ttlGraceMs);
    })
    .map((n) => n.localPort);
  if (staleLocalPorts.length) {
    await prisma.neighbor.deleteMany({
      where: { deviceId: device.id, localPort: { in: staleLocalPorts } },
    });
  }

  return { rows: rows.length };
};

// One pass over every online, onboarded switch that's verified to support LLDP (registry.ts
// capability flag) — unverified models are skipped rather than spammed with a command that
// might not exist on their CLI.
export const pollAllDevicesLldp = async () => {
  if (lldpRunning) {
    console.log("[topology] LLDP poll already in progress — skipping this tick");
    return;
  }
  lldpRunning = true;
  try {
    const devices = await prisma.device.findMany({
      where: { status: "online", organizationId: { not: null } },
      select: { id: true, serialNumber: true, model: true, name: true },
    });
    for (const d of devices) {
      if (!getDeviceCapabilities(d.model).lldp) continue;
      try {
        const { rows } = await refreshDeviceLldpNeighbors(d);
        console.log(`[topology] ${d.name}: ${rows} LLDP neighbors refreshed`);
      } catch (err) {
        const msg = err instanceof CommandTimeoutError ? "timed out" : (err as Error).message;
        console.warn(`[topology] ${d.name}: LLDP refresh failed — ${msg}`);
      }
    }
  } finally {
    lldpRunning = false;
  }
};

// One pass over every online, onboarded switch. Devices are polled sequentially so a fleet
// refresh never floods the broker; a single slow/unresponsive switch doesn't abort the rest.
export const pollAllDevices = async () => {
  if (running) {
    console.log("[topology] Poll already in progress — skipping this tick");
    return;
  }
  running = true;
  try {
    const devices = await prisma.device.findMany({
      where: { status: "online", organizationId: { not: null } },
      select: { id: true, serialNumber: true, model: true, name: true },
    });
    for (const d of devices) {
      try {
        const { rows } = await refreshDeviceMacTable(d);
        console.log(`[topology] ${d.name}: ${rows} MAC entries refreshed`);
      } catch (err) {
        const msg = err instanceof CommandTimeoutError ? "timed out" : (err as Error).message;
        console.warn(`[topology] ${d.name}: MAC table refresh failed — ${msg}`);
      }
    }
  } finally {
    running = false;
  }
};

export const startTopologyPoller = () => {
  if (timer) return;
  // First pass shortly after boot (give MQTT a moment to connect), then on the interval.
  setTimeout(() => void pollAllDevices(), 20 * 1000);
  timer = setInterval(() => void pollAllDevices(), POLL_INTERVAL_MS);
  console.log(`[topology] Poller started (every ${POLL_INTERVAL_MS / 60000} min, read-only)`);

  if (lldpTimer) return;
  setTimeout(() => void pollAllDevicesLldp(), 25 * 1000);
  lldpTimer = setInterval(() => void pollAllDevicesLldp(), LLDP_POLL_INTERVAL_MS);
  console.log(
    `[topology] LLDP poller started (every ${LLDP_POLL_INTERVAL_MS / 60000} min, read-only, LLDP_POLL_INTERVAL_MS env-overridable)`,
  );
};
