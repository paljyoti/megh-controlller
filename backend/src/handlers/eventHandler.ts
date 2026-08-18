import prisma from "../db/client.js";
import type { EventPayload } from "../interfaces/mqttInterface.js";

/*
  Handles switch/<sn>/event
  Saves port events (port_up, port_down, etc.) to DeviceEvent table.
 */

// Events that should raise an alarm, and at what severity.
const ALARM_EVENTS: Record<string, "critical" | "warning" | "info"> = {
  port_down: "warning",
  device_reboot: "critical",
};

// Events that clear a previously raised alarm of the given type (matched on deviceId + port).
const RESOLVING_EVENTS: Record<string, string> = {
  port_up: "port_down",
};

const eventHandler = async (serialNumber: string, data: EventPayload) => {
  try {
    console.log(`[event] ${data.event} from ${serialNumber}`, data);

    const device = await prisma.device.findUnique({
      where: { serialNumber },
    });

    if (!device) {
      console.warn(`[event] Device not found for serialNumber: ${serialNumber}. Skipping.`);
      return;
    }

    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        event: data.event,
        port: data.data?.port ?? null,
        timestamp: BigInt(data.timestamp),
      },
    });

    console.log(`[event] Saved event "${data.event}" for ${serialNumber}`);

    const port = data.data?.port ?? null;

    const severity = ALARM_EVENTS[data.event];
    if (severity) {
      await prisma.alarm.create({
        data: {
          deviceId: device.id,
          source: "event",
          type: data.event,
          port,
          severity,
          message: port
            ? `${data.event} on port ${port} (${device.name})`
            : `${data.event} on ${device.name}`,
        },
      });
      console.log(`[event] Raised "${severity}" alarm for "${data.event}" on ${serialNumber}`);
    }

    const resolvedType = RESOLVING_EVENTS[data.event];
    if (resolvedType) {
      const { count } = await prisma.alarm.updateMany({
        where: { deviceId: device.id, type: resolvedType, status: "active", port },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      if (count > 0) {
        console.log(`[event] Resolved ${count} "${resolvedType}" alarm(s) on ${serialNumber}`);
      }
    }
  } catch (err) {
    console.error(`[event] Error saving event for ${serialNumber}:`, err);
  }
};

export default eventHandler;