import prisma from "../../db/client.js";
import { getDeviceCommands } from "../../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../deviceCommand.js";
import { parseMacTable } from "./macTableParser.js";

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

let timer: NodeJS.Timeout | null = null;
let running = false;

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
};
