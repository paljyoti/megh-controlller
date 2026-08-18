import prisma from "../db/client.js";
import { getDeviceCommands } from "../commands/deviceCommands.js";
import { publishCommand } from "../services/deviceCommand.js";
import type { TelemetryPayload } from "../interfaces/mqttInterface.js";

// Identity fields ("model" / "macAddress" / "hardwareVersion") normally arrive via the
// switch/<sn>/first_seen message. If that message was missed (e.g. the switch booted
// before the backend was subscribed), the device gets stuck with placeholder values
// forever, since telemetry never carries these fields. Recover by asking the switch
// directly via the "show version" command, throttled to avoid spamming every ~30s tick.
const IDENTITY_RECOVERY_THROTTLE_MS = 10 * 60 * 1000;

type AlarmMetricType = "cpu_high" | "memory_high" | "temperature_high";

// Threshold beyond which a metric raises a "warning" alarm.
const THRESHOLDS: Record<AlarmMetricType, number> = {
  cpu_high: 90,
  memory_high: 85,
  temperature_high: 70,
};

// Creates a threshold alarm the first time a metric crosses its limit, and
// resolves it once the metric drops back below the limit. Telemetry arrives
// every ~30s, so without this active-alarm check we'd create a fresh alarm
// on every single tick the metric stays breached.
const evaluateThresholdAlarm = async (
  deviceId: string,
  type: AlarmMetricType,
  value: number,
  unit: string,
) => {
  const limit = THRESHOLDS[type];
  const breached = value > limit;

  const activeAlarm = await prisma.alarm.findFirst({
    where: { deviceId, type, source: "threshold", status: "active" },
  });

  if (breached && !activeAlarm) {
    await prisma.alarm.create({
      data: {
        deviceId,
        source: "threshold",
        type,
        severity: "warning",
        message: `${type.replace("_high", "").toUpperCase()} at ${value}${unit} (threshold ${limit}${unit})`,
      },
    });
    console.log(`[telemetry] Raised "${type}" threshold alarm (${value}${unit} > ${limit}${unit})`);
  } else if (!breached && activeAlarm) {
    await prisma.alarm.update({
      where: { id: activeAlarm.id },
      data: { status: "resolved", resolvedAt: new Date() },
    });
    console.log(`[telemetry] Resolved "${type}" threshold alarm (${value}${unit} <= ${limit}${unit})`);
  }
};

const requestIdentityRecovery = async (device: { id: string; serialNumber: string; model: string; macAddress: string | null; hardwareVersion: string | null }) => {
  const needsRecovery = device.model === "unknown" || !device.macAddress || !device.hardwareVersion;
  if (!needsRecovery) return;

  const recentRequest = await prisma.commandLog.findFirst({
    where: {
      deviceId: device.id,
      command: "show version",
      createdAt: { gt: new Date(Date.now() - IDENTITY_RECOVERY_THROTTLE_MS) },
    },
  });
  if (recentRequest) return;

  const commands = getDeviceCommands(device.model);
  const { requestId } = await publishCommand(device, commands.system.showVersion());
  console.log(`[telemetry] Device ${device.serialNumber} missing identity fields — requested 'show version' (${requestId})`);
};

/*
  Handles switch/<sn>/telemetry
  Saves system metrics + per-port interface stats to the DB.
  Expected payload includes: timestamp, cpu_usage, memory_usage, temperature,
  serial_number, software_version, and interfaces array with port stats
 */

const telemetryHandler = async (
  serialNumber: string,
  data: TelemetryPayload,
) => {
  try {
    console.log(`[telemetry] Received from ${serialNumber}`);
    console.log(`[telemetry] Data:`, JSON.stringify(data, null, 2));

    // Find device by serial number
    let device = await prisma.device.findUnique({
      where: { serialNumber },
    });

    if (!device) {
      console.warn(
        `[telemetry] Device not found for serialNumber: ${serialNumber}. Creating new device.`,
      );
      device = await prisma.device.create({
        data: {
          serialNumber: data.serial_number,
          softwareVersion: data.software_version,
          name: `Switch-${data.serial_number}`,
          model: "unknown",
          status: "online",
        },
      });
    }

    await requestIdentityRecovery(device);

    // Update Master record if it exists for this device
    let master = await prisma.master.findUnique({
      where: { serialNumber: data.serial_number },
    });

    if (master) {
      await prisma.master.update({
        where: { id: master.id },
        data: {
          softwareVersion: data.software_version,
          cpuUsage: String(data.cpu_usage),
          memoryUsage: String(data.memory_usage),
          temperature: String(data.temperature),
          timestamp: String(data.timestamp),
        },
      });
    } else {
      await prisma.master.create({
        data: {
          deviceId: device.id,
          serialNumber: data.serial_number,
          softwareVersion: data.software_version,
          cpuUsage: String(data.cpu_usage),
          memoryUsage: String(data.memory_usage),
          temperature: String(data.temperature),
          timestamp: String(data.timestamp),
        },
      });
    }

    // Create Telemetry record + nested InterfaceStat records in one transaction
    const telemetry = await prisma.telemetry.create({
      data: {
        deviceId: device.id,
        serialNumber: data.serial_number,
        softwareVersion: data.software_version,
        cpuUsage: String(data.cpu_usage),
        memoryUsage: String(data.memory_usage),
        temperature: String(data.temperature),
        timestamp: String(data.timestamp),
        interfaceStats: {
          create: (data.interfaces ?? []).map((iface) => ({
            port: iface.port,
            status: iface.status,
            macAddress: iface.mac_address ?? "",
            ipAddress: iface.ip_address ?? null,
            rxBytes: String(iface.rx_bytes ?? 0),
            txBytes: String(iface.tx_bytes ?? 0),
            rxPackets: String(iface.rx_packets ?? 0),
            txPackets: String(iface.tx_packets ?? 0),
          })),
        },
      },
      include: {
        interfaceStats: true,
      },
    });

    // Keep device softwareVersion and status in sync
    await prisma.device.update({
      where: { id: device.id },
      data: {
        softwareVersion: data.software_version,
        status: "online",
      },
    });

    console.log(
      `[telemetry] Saved telemetry ${telemetry.id} for ${serialNumber} with ${data.interfaces?.length ?? 0} interfaces`,
    );

    await evaluateThresholdAlarm(device.id, "cpu_high", Number(data.cpu_usage), "%");
    await evaluateThresholdAlarm(device.id, "memory_high", Number(data.memory_usage), "%");
    await evaluateThresholdAlarm(device.id, "temperature_high", Number(data.temperature), "°C");

  } catch (err) {
    console.error(
      `[telemetry] Error saving telemetry for ${serialNumber}:`,
      err,
    );
  }
};

export default telemetryHandler;
