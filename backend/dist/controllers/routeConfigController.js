import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands } from "../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../services/deviceCommand.js";
// Helper: find device by DB id OR serialNumber (mirrors deviceController.ts)
const findDeviceById = async (id) => {
    return prisma.device.findFirst({
        where: { OR: [{ id }, { serialNumber: id }] },
    });
};
// Helper: verify device exists and the user may configure it (mirrors deviceController.ts)
const verifyDeviceAccess = async (req, deviceId) => {
    const device = await findDeviceById(deviceId);
    if (!device)
        return { ok: false, status: 404, message: "Device not found" };
    if (!req.user)
        return { ok: false, status: 401, message: "unauthorized request" };
    if (req.user.role === "SUPERADMIN")
        return { ok: true, device };
    if (req.user.role === "ADMIN") {
        if (device.organizationId !== req.user.orgs?.id)
            return { ok: false, status: 403, message: "Access denied: device not in your organization" };
        return { ok: true, device };
    }
    if (device.assignedToId !== req.user.id)
        return { ok: false, status: 403, message: "Access denied: device not assigned to you" };
    return { ok: true, device };
};
// Matches digit-count only — still checks each octet is 0-255 below, since e.g.
// "192.160.300.0" passes a bare \d{1,3} regex but isn't a valid IP (300 > 255) and gets
// rejected by the switch itself ("% Invalid input detected") instead of caught here.
const IP_SEGMENT_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const isValidIpSegment = (v) => {
    const m = v.match(IP_SEGMENT_RE);
    if (!m)
        return false;
    return [m[1], m[2], m[3], m[4]].every((o) => Number(o) >= 0 && Number(o) <= 255);
};
const parseRouteBody = (body) => {
    const isDefaultRoute = body.isDefaultRoute === true;
    const destIpSegment = isDefaultRoute ? "0.0.0.0" : String(body.destIpSegment ?? "").trim();
    const destIpMask = isDefaultRoute ? "0.0.0.0" : String(body.destIpMask ?? "").trim();
    const interfaceType = typeof body.interfaceType === "string" && body.interfaceType.trim()
        ? body.interfaceType.trim()
        : "null0 interface";
    if (!isValidIpSegment(destIpSegment))
        return { error: "Dest IP Segment must be a valid IP" };
    if (!isValidIpSegment(destIpMask))
        return { error: "Dest IP Mask must be a valid IP mask" };
    const forwardingRoutingAddress = typeof body.forwardingRoutingAddress === "string" && body.forwardingRoutingAddress.trim()
        ? body.forwardingRoutingAddress.trim()
        : null;
    if (interfaceType !== "null0 interface" && !forwardingRoutingAddress)
        return { error: "Forwarding Routing Address is required for this interface type" };
    let distanceMetric = null;
    if (body.distanceMetric !== undefined && body.distanceMetric !== null && body.distanceMetric !== "") {
        const parsed = Number(body.distanceMetric);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 255)
            return { error: "Distance Metric must be an integer between 1 and 255" };
        distanceMetric = parsed;
    }
    let routingTag = null;
    if (body.routingTag !== undefined && body.routingTag !== null && body.routingTag !== "") {
        const parsed = Number(body.routingTag);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4294967295)
            return { error: "Routing Tag must be an integer between 1 and 4294967295" };
        routingTag = String(parsed);
    }
    const description = typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
    return {
        data: {
            isDefaultRoute,
            destIpSegment,
            destIpMask,
            interfaceType,
            forwardingRoutingAddress,
            distanceMetric,
            routingTag,
            description,
        },
    };
};
// POST /api/v1/device/:id/route-config
export const createRouteConfig = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const parsed = parseRouteBody(req.body);
    if ("error" in parsed)
        return res.status(400).json(new ApiResponse(400, {}, parsed.error));
    const routeData = parsed.data;
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure routes`));
    const existing = await prisma.routeConfig.findFirst({
        where: { deviceId: device.id, destIpSegment: routeData.destIpSegment, destIpMask: routeData.destIpMask },
    });
    if (existing)
        return res
            .status(409)
            .json(new ApiResponse(409, {}, "A route with this destination already exists on this device"));
    const commands = getDeviceCommands(device.model);
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.route.create(routeData),
            logParams: { ...routeData },
        });
        if (response.status !== 0) {
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        }
        const route = await prisma.routeConfig.create({
            data: { ...routeData, deviceId: device.id },
        });
        return res
            .status(200)
            .json(new ApiResponse(200, { route, requestId }, "Route created successfully"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res
            .status(504)
            .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// DELETE /api/v1/device/:id/route-config/:routeId
export const deleteRouteConfig = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    const routeId = req.params.routeId;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    if (!routeId)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: routeId"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const existing = await prisma.routeConfig.findFirst({ where: { id: routeId, deviceId: device.id } });
    if (!existing)
        return res.status(404).json(new ApiResponse(404, {}, "Route not found on this device"));
    // ?force=true skips the device command entirely and only removes our DB record — for routes
    // that have already drifted off the switch (e.g. removed outside the platform, or never
    // actually matched what's live), where a normal delete has nothing to delete and the switch
    // will always reject it. No device round-trip happens, so this doesn't require the device to
    // be online.
    if (req.query.force === "true") {
        await prisma.routeConfig.delete({ where: { id: existing.id } });
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Route removed from platform records (no command sent to device)"));
    }
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure routes`));
    const commands = getDeviceCommands(device.model);
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.route.delete(existing),
            logParams: { routeId: existing.id },
        });
        if (response.status !== 0) {
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        }
        await prisma.routeConfig.delete({ where: { id: existing.id } });
        return res.status(200).json(new ApiResponse(200, { requestId }, "Route deleted successfully"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res
            .status(504)
            .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// GET /api/v1/device/:id/route-config
export const listRouteConfigs = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const routes = await prisma.routeConfig.findMany({
        where: { deviceId: access.device.id },
        orderBy: { createdAt: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, { routes }, "Routes fetched"));
});
//# sourceMappingURL=routeConfigController.js.map