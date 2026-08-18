import prisma from "../db/client.js";
import type { StatusPayload } from "../interfaces/mqttInterface.js";

/*
  Handles switch/<sn>/status
  - Saves to DeviceStatus history
 - Updates Device.status to reflect current state
 
  Notes from spec:
 - Offline is implemented via MQTT LWT (Last Will and Testament) with uptime=0
 - Rebooting notification delivery is best-effort only
 */
const statusHandler = async (serialNumber: string, data: StatusPayload) => {
  try {
    console.log(`[status] ${data.status} from ${serialNumber} (uptime: ${data.uptime}s)`);

    const device = await prisma.device.findUnique({
      where: { serialNumber },
    });

    if (!device) {
      console.warn(`[status] Device not found for serialNumber: ${serialNumber}. Skipping.`);
      return;
    }

    // Normalized status: if uptime is 0 and status is not explicitly "offline"/"rebooting", treat as offline (LWT)
    const normalizedStatus =
      data.uptime === 0 && data.status !== "rebooting" ? "offline" : data.status;

    // Save status to history
    await prisma.deviceStatus.create({
      data: {
        deviceId: device.id,
        status: normalizedStatus,
        uptime: BigInt(data.uptime ?? 0),
        softwareVersion: data.software_version ?? null,
      },
    });

    // Update live status on Device record
    await prisma.device.update({
      where: { id: device.id },
       data: {
        status: normalizedStatus,
        softwareVersion: data.software_version ?? device.softwareVersion,
      },
    });

    console.log(`[status] Device ${serialNumber} is now "${normalizedStatus}"`);

    // Raise/resolve a "device_offline" alarm on offline transitions, keyed off the
    // previous status so we don't create a duplicate alarm on every status ping.
    if (device.status !== "offline" && normalizedStatus === "offline") {
      await prisma.alarm.create({
        data: {
          deviceId: device.id,
          source: "event",
          type: "device_offline",
          severity: "critical",
          message: `${device.name} went offline`,
        },
      });
      console.log(`[status] Raised "critical" alarm for device_offline on ${serialNumber}`);
    } else if (device.status === "offline" && normalizedStatus !== "offline") {
      const { count } = await prisma.alarm.updateMany({
        where: { deviceId: device.id, type: "device_offline", status: "active" },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      if (count > 0) {
        console.log(`[status] Resolved ${count} "device_offline" alarm(s) on ${serialNumber}`);
      }
    }
  } catch (err) {
    console.error(`[status] Error saving status for ${serialNumber}:`, err);
  } 
};

export default statusHandler;