import type { Response } from "express";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import type { newReq } from "../schema/types.js";

// Same device-scoping rule used by deviceController: SUPERADMIN sees everything,
// ADMIN sees their org's devices, USER sees only devices assigned to them.
const deviceWhereForUser = (req: newReq) => {
  if (!req.user) throw new ApiError(401, "unauthorized request");
  if (req.user.role === "ADMIN" && req.user.orgs?.id) {
    return { organizationId: req.user.orgs.id };
  }
  if (req.user.role === "USER") return { assignedToId: req.user.id };
  return {};
};

// GET /api/v1/alarm?status=active&severity=critical&limit=50
export const getAllAlarms = asyncHandlers(async (req: newReq, res: Response) => {
  const { status, severity } = req.query as { status?: string; severity?: string };
  const limit = Number(req.query.limit) || 50;

  const alarms = await prisma.alarm.findMany({
    where: {
      device: deviceWhereForUser(req),
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
    },
    include: { device: { select: { id: true, name: true, serialNumber: true } } },
    orderBy: { triggeredAt: "desc" },
    take: limit,
  });
  return res.status(200).json(new ApiResponse(200, { alarms }, "Alarms fetched"));
});

// GET /api/v1/alarm/summary — counts for dashboard cards
export const getAlarmSummary = asyncHandlers(async (req: newReq, res: Response) => {
  const where = { device: deviceWhereForUser(req) };

  const [active, critical, warning, total] = await Promise.all([
    prisma.alarm.count({ where: { ...where, status: "active" } }),
    prisma.alarm.count({ where: { ...where, status: "active", severity: "critical" } }),
    prisma.alarm.count({ where: { ...where, status: "active", severity: "warning" } }),
    prisma.alarm.count({ where }),
  ]);
  return res
    .status(200)
    .json(new ApiResponse(200, { active, critical, warning, total }, "Alarm summary fetched"));
});

// GET /api/v1/alarm/device/:id
export const getDeviceAlarms = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceId = req.params.id;
  if (!deviceId) throw new ApiError(400, "Missing route parameter: id");

  const device = await prisma.device.findFirst({
    where: { OR: [{ id: deviceId }, { serialNumber: deviceId }] },
  });
  if (!device) throw new ApiError(404, "Device not found");

  const limit = Number(req.query.limit) || 50;
  const alarms = await prisma.alarm.findMany({
    where: { deviceId: device.id },
    orderBy: { triggeredAt: "desc" },
    take: limit,
  });
  return res.status(200).json(new ApiResponse(200, { alarms }, "Device alarms fetched"));
});

// PATCH /api/v1/alarm/:id/acknowledge
export const acknowledgeAlarm = asyncHandlers(async (req: newReq, res: Response) => {
  if (!req.user) throw new ApiError(401, "unauthorized request");
  const alarmId = req.params.id;
  if (!alarmId) throw new ApiError(400, "Missing route parameter: id");

  const alarm = await prisma.alarm.findUnique({ where: { id: alarmId } });
  if (!alarm) throw new ApiError(404, "Alarm not found");

  const updated = await prisma.alarm.update({
    where: { id: alarmId },
    data: { status: "acknowledged", acknowledgedBy: req.user.id },
  });
  return res.status(200).json(new ApiResponse(200, { alarm: updated }, "Alarm acknowledged"));
});

// PATCH /api/v1/alarm/:id/resolve
export const resolveAlarm = asyncHandlers(async (req: newReq, res: Response) => {
  const alarmId = req.params.id;
  if (!alarmId) throw new ApiError(400, "Missing route parameter: id");

  const alarm = await prisma.alarm.findUnique({ where: { id: alarmId } });
  if (!alarm) throw new ApiError(404, "Alarm not found");

  const updated = await prisma.alarm.update({
    where: { id: alarmId },
    data: { status: "resolved", resolvedAt: new Date() },
  });
  return res.status(200).json(new ApiResponse(200, { alarm: updated }, "Alarm resolved"));
});
