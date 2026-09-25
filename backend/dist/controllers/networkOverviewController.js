import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
// Same device-scoping rule used by deviceController/alarmController: SUPERADMIN sees
// everything, ADMIN sees their org's devices, USER sees only devices assigned to them.
const deviceWhereForUser = (req) => {
    if (!req.user)
        throw new ApiError(401, "unauthorized request");
    if (req.user.role === "ADMIN" && req.user.orgs?.id) {
        return { organizationId: req.user.orgs.id };
    }
    if (req.user.role === "USER")
        return { assignedToId: req.user.id };
    return {};
};
const WINDOW_HOURS = 24;
// Sums rx/tx bytes across every interface reported in one telemetry snapshot. This is an
// approximation, not a true network-boundary measurement — traffic that enters on one port and
// leaves via another (e.g. the uplink) gets counted on both, so this double-counts internal
// switch traffic. A correct measurement would only sum the device's designated uplink
// interface, but no such designation is stored anywhere yet (Port model has no "isUplink"
// field) — that's a separate feature. Good enough for a first pass with a small number of
// devices; revisit if this needs to be accurate at scale.
const sumBytes = (interfaceStats) => {
    let rx = 0n;
    let tx = 0n;
    for (const s of interfaceStats) {
        rx += BigInt(s.rxBytes || "0");
        tx += BigInt(s.txBytes || "0");
    }
    return { rx, tx };
};
// GET /api/v1/dashboard/network-overview
// Real traffic derived from Telemetry/InterfaceStat counters — NOT the old getAllSwitches mock
// path in dashboardController.ts (that one is unrelated, seed-data-driven, and untouched here).
//
// interfaceStats.rxBytes/txBytes are cumulative counters (confirmed by schema.prisma's own
// comment and by them coming straight off the device like SNMP interface counters), not
// instantaneous rates — so a rate is derived from the delta between two consecutive telemetry
// snapshots of the same device, divided by the real elapsed time between them:
//   bytesPerSec = (currentBytes - previousBytes) / (currentTime - previousTime)
// A negative delta (counter reset — e.g. the device rebooted) is zeroed rather than plotted as
// a bogus spike. Rates are bucketed into hourly windows and averaged per bucket; a bucket with
// no real samples is omitted entirely (never zero-filled or interpolated) — every point in the
// response reflects an actual telemetry observation.
export const getNetworkOverview = asyncHandlers(async (req, res) => {
    const where = deviceWhereForUser(req);
    const devices = await prisma.device.findMany({ where, select: { id: true } });
    const deviceIds = devices.map((d) => d.id);
    if (deviceIds.length === 0) {
        return res.status(200).json(new ApiResponse(200, { overview: [] }, "Network overview fetched"));
    }
    const windowStart = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);
    const snapshots = await prisma.telemetry.findMany({
        where: { deviceId: { in: deviceIds }, createdAt: { gte: windowStart } },
        include: { interfaceStats: { select: { rxBytes: true, txBytes: true } } },
        orderBy: { createdAt: "asc" },
    });
    // Group by device so deltas are only ever computed between two snapshots of the SAME device.
    const byDevice = new Map();
    for (const snap of snapshots) {
        const list = byDevice.get(snap.deviceId) ?? [];
        list.push(snap);
        byDevice.set(snap.deviceId, list);
    }
    // hour-bucket key (ms since epoch, floored to the hour) -> accumulated Mbps samples.
    const buckets = new Map();
    const HOUR_MS = 60 * 60 * 1000;
    for (const deviceSnaps of byDevice.values()) {
        for (let i = 1; i < deviceSnaps.length; i++) {
            const prevSnap = deviceSnaps[i - 1];
            const currSnap = deviceSnaps[i];
            const deltaSeconds = (currSnap.createdAt.getTime() - prevSnap.createdAt.getTime()) / 1000;
            if (deltaSeconds <= 0)
                continue; // guard against out-of-order/duplicate timestamps
            const prevTotals = sumBytes(prevSnap.interfaceStats);
            const currTotals = sumBytes(currSnap.interfaceStats);
            const deltaRx = currTotals.rx - prevTotals.rx;
            const deltaTx = currTotals.tx - prevTotals.tx;
            // Counter reset (device rebooted, counters zeroed) — zero the delta rather than plotting
            // a huge bogus spike from "0 minus a large previous value".
            const rxBytesPerSec = deltaRx < 0n ? 0 : Number(deltaRx) / deltaSeconds;
            const txBytesPerSec = deltaTx < 0n ? 0 : Number(deltaTx) / deltaSeconds;
            // bytes/sec -> Mbps (the existing chart's Y-axis/tooltip are labeled in Mbps).
            const downloadMbps = (rxBytesPerSec * 8) / 1_000_000;
            const uploadMbps = (txBytesPerSec * 8) / 1_000_000;
            const bucketKey = Math.floor(currSnap.createdAt.getTime() / HOUR_MS) * HOUR_MS;
            const bucket = buckets.get(bucketKey) ?? { download: [], upload: [] };
            bucket.download.push(downloadMbps);
            bucket.upload.push(uploadMbps);
            buckets.set(bucketKey, bucket);
        }
    }
    const avg = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
    const overview = Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([bucketKey, { download, upload }]) => ({
        time: new Date(bucketKey).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        download: Math.round(avg(download) * 10) / 10,
        upload: Math.round(avg(upload) * 10) / 10,
    }));
    return res.status(200).json(new ApiResponse(200, { overview }, "Network overview fetched"));
});
//# sourceMappingURL=networkOverviewController.js.map