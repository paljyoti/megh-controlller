import type { Response } from "express";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import type { newReq } from "../schema/types.js";

// Device Details → Report tab. A single, read-only endpoint that scopes every existing
// time-stamped device record (Telemetry, Alarm, DeviceEvent, DeviceStatus) to a selected time
// period and returns both the aggregates the charts need and the underlying rows for drill-down
// — so the frontend never has to stitch several endpoints together or refetch on a chart click.
// This file is additive: it duplicates the small device-access helper already used by
// deviceController.ts rather than exporting from there, so that file is left untouched.

const findDeviceById = async (id: string) => {
  return prisma.device.findFirst({ where: { OR: [{ id }, { serialNumber: id }] } });
};

const verifyDeviceAccess = async (req: newReq, deviceId: string) => {
  const device = await findDeviceById(deviceId);
  if (!device) throw new ApiError(404, "Device not found");
  if (!req.user) throw new ApiError(401, "unauthorized request");

  if (req.user.role === "SUPERADMIN") return device;
  if (req.user.role === "ADMIN") {
    if (device.organizationId !== req.user.orgs?.id)
      throw new ApiError(403, "Access denied: device not in your organization");
    return device;
  }
  if (device.assignedToId !== req.user.id)
    throw new ApiError(403, "Access denied: device not assigned to you");
  return device;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_RANGE_MS = 366 * DAY_MS;
const LIST_CAP = 500;

type RangeKey = "4h" | "24h" | "7d" | "30d" | "week" | "custom";
const RANGE_KEYS = new Set<RangeKey>(["4h", "24h", "7d", "30d", "week", "custom"]);

// Resolves the selected periodicity to a concrete [from, to] window. "week" is the current
// calendar week (Monday 00:00 → now), distinct from the rolling "7d" window.
const resolveRange = (req: newReq): { from: Date; to: Date; range: RangeKey } => {
  const rangeParam = (req.query.range as string) || "24h";
  if (!RANGE_KEYS.has(rangeParam as RangeKey)) throw new ApiError(400, `Invalid range: ${rangeParam}`);
  const range = rangeParam as RangeKey;
  const now = new Date();

  if (range === "custom") {
    const fromRaw = req.query.from as string | undefined;
    const toRaw = req.query.to as string | undefined;
    if (!fromRaw) throw new ApiError(400, "from is required for a custom range");
    const from = new Date(fromRaw);
    const to = toRaw ? new Date(toRaw) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
      throw new ApiError(400, "from/to must be valid dates");
    if (from >= to) throw new ApiError(400, "from must be before to");
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) throw new ApiError(400, "Range is too large");
    return { from, to, range };
  }

  if (range === "week") {
    const day = now.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - diffToMonday);
    return { from, to: now, range };
  }

  const spanMs = { "4h": 4 * HOUR_MS, "24h": 24 * HOUR_MS, "7d": 7 * DAY_MS, "30d": 30 * DAY_MS }[range];
  return { from: new Date(now.getTime() - spanMs), to: now, range };
};

const sumBytes = (interfaceStats: { rxBytes: string; txBytes: string }[]) => {
  let rx = 0n;
  let tx = 0n;
  for (const s of interfaceStats) {
    rx += BigInt(s.rxBytes || "0");
    tx += BigInt(s.txBytes || "0");
  }
  return { rx, tx };
};

// GET /api/v1/device/:id/report?range=4h|24h|7d|30d|week|custom&from=&to=
export const getDeviceReport = asyncHandlers(async (req: newReq, res: Response) => {
  const deviceId = req.params.id;
  if (!deviceId) throw new ApiError(400, "Missing route parameter: id");
  const device = await verifyDeviceAccess(req, deviceId);

  const { from, to, range } = resolveRange(req);
  // Dense windows (<=48h) read better hour by hour; anything wider is bucketed per day.
  const granularity: "hour" | "day" = to.getTime() - from.getTime() <= 2 * DAY_MS ? "hour" : "day";
  const bucketMs = granularity === "hour" ? HOUR_MS : DAY_MS;
  const bucketLabel = (bucketStart: number) =>
    granularity === "hour"
      ? new Date(bucketStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : new Date(bucketStart).toLocaleDateString([], { month: "short", day: "numeric" });

  // ── Traffic (same delta-between-snapshots method as dashboard/network-overview, one device) ──
  const snapshots = await prisma.telemetry.findMany({
    where: { deviceId: device.id, createdAt: { gte: from, lte: to } },
    include: { interfaceStats: { select: { rxBytes: true, txBytes: true } } },
    orderBy: { createdAt: "asc" },
  });

  const trafficBuckets = new Map<number, { download: number[]; upload: number[] }>();
  for (let i = 1; i < snapshots.length; i++) {
    const prevSnap = snapshots[i - 1]!;
    const currSnap = snapshots[i]!;
    const deltaSeconds = (currSnap.createdAt.getTime() - prevSnap.createdAt.getTime()) / 1000;
    if (deltaSeconds <= 0) continue;

    const prevTotals = sumBytes(prevSnap.interfaceStats);
    const currTotals = sumBytes(currSnap.interfaceStats);
    const deltaRx = currTotals.rx - prevTotals.rx;
    const deltaTx = currTotals.tx - prevTotals.tx;
    const rxBytesPerSec = deltaRx < 0n ? 0 : Number(deltaRx) / deltaSeconds;
    const txBytesPerSec = deltaTx < 0n ? 0 : Number(deltaTx) / deltaSeconds;
    const downloadMbps = (rxBytesPerSec * 8) / 1_000_000;
    const uploadMbps = (txBytesPerSec * 8) / 1_000_000;

    const bucketKey = Math.floor(currSnap.createdAt.getTime() / bucketMs) * bucketMs;
    const bucket = trafficBuckets.get(bucketKey) ?? { download: [], upload: [] };
    bucket.download.push(downloadMbps);
    bucket.upload.push(uploadMbps);
    trafficBuckets.set(bucketKey, bucket);
  }
  const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const traffic = Array.from(trafficBuckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucketKey, { download, upload }]) => ({
      time: bucketLabel(bucketKey),
      download: Math.round(avg(download) * 100) / 100,
      upload: Math.round(avg(upload) * 100) / 100,
    }));
  const avgDownloadMbps = traffic.length ? Math.round(avg(traffic.map((t) => t.download)) * 100) / 100 : 0;
  const avgUploadMbps = traffic.length ? Math.round(avg(traffic.map((t) => t.upload)) * 100) / 100 : 0;
  const peakDownloadMbps = traffic.length ? Math.max(...traffic.map((t) => t.download)) : 0;
  const peakUploadMbps = traffic.length ? Math.max(...traffic.map((t) => t.upload)) : 0;

  // ── Alarms ──
  const alarmRows = await prisma.alarm.findMany({
    where: { deviceId: device.id, triggeredAt: { gte: from, lte: to } },
    orderBy: { triggeredAt: "desc" },
    take: LIST_CAP,
  });
  const alarmsBySeverity = ["critical", "warning", "info"].map((severity) => ({
    severity,
    count: alarmRows.filter((a) => a.severity === severity).length,
  }));
  const alarmTypeCounts = new Map<string, number>();
  for (const a of alarmRows) alarmTypeCounts.set(a.type, (alarmTypeCounts.get(a.type) ?? 0) + 1);
  const alarmsByType = Array.from(alarmTypeCounts.entries()).map(([type, count]) => ({ type, count }));

  // ── Events (port_up / port_down etc.) ──
  const eventRows = await prisma.deviceEvent.findMany({
    where: { deviceId: device.id, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "desc" },
    take: LIST_CAP,
  });
  const eventTypeCounts = new Map<string, number>();
  const eventTimelineBuckets = new Map<number, number>();
  for (const e of eventRows) {
    eventTypeCounts.set(e.event, (eventTypeCounts.get(e.event) ?? 0) + 1);
    const bucketKey = Math.floor(e.createdAt.getTime() / bucketMs) * bucketMs;
    eventTimelineBuckets.set(bucketKey, (eventTimelineBuckets.get(bucketKey) ?? 0) + 1);
  }
  const eventsByType = Array.from(eventTypeCounts.entries()).map(([type, count]) => ({ type, count }));
  const eventsTimeline = Array.from(eventTimelineBuckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucketKey, count]) => ({ time: bucketLabel(bucketKey), count }));

  // ── Status history / uptime % (each record's status is assumed to hold until the next one,
  // or until `to` for the most recent record) ──
  const statusRows = await prisma.deviceStatus.findMany({
    where: { deviceId: device.id, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "asc" },
  });
  let onlineMs = 0;
  let coveredMs = 0;
  for (let i = 0; i < statusRows.length; i++) {
    const row = statusRows[i]!;
    const segmentEnd = i + 1 < statusRows.length ? statusRows[i + 1]!.createdAt : to;
    const segmentMs = Math.max(0, segmentEnd.getTime() - row.createdAt.getTime());
    coveredMs += segmentMs;
    if (row.status === "online") onlineMs += segmentMs;
  }
  const uptimePct = coveredMs > 0 ? Math.round((onlineMs / coveredMs) * 1000) / 10 : null;
  const statusHistoryList = statusRows
    .slice(-LIST_CAP)
    .reverse()
    .map((s) => ({ ...s, uptime: s.uptime.toString() }));

  const summary = {
    uptimePct,
    totalAlarms: alarmRows.length,
    criticalAlarms: alarmsBySeverity.find((s) => s.severity === "critical")?.count ?? 0,
    warningAlarms: alarmsBySeverity.find((s) => s.severity === "warning")?.count ?? 0,
    infoAlarms: alarmsBySeverity.find((s) => s.severity === "info")?.count ?? 0,
    portEvents: eventRows.length,
    avgDownloadMbps,
    avgUploadMbps,
    peakDownloadMbps,
    peakUploadMbps,
  };

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        period: { range, from: from.toISOString(), to: to.toISOString() },
        granularity,
        summary,
        traffic,
        alarms: { bySeverity: alarmsBySeverity, byType: alarmsByType, list: alarmRows },
        events: { byType: eventsByType, timeline: eventsTimeline, list: eventRows.map((e) => ({ ...e, timestamp: e.timestamp.toString() })) },
        statusHistory: { uptimePct, list: statusHistoryList },
      },
      "Device report fetched"
    )
  );
});
