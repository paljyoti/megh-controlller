import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands } from "../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../services/deviceCommand.js";
const MIN_LACP_PRIORITY = 1;
const MAX_LACP_PRIORITY = 65535;
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
const VALID_MODES = ["static", "active", "passive"];
const LOAD_BALANCE_METHODS = [
    "dst-ip",
    "dst-mac",
    "dst-port",
    "src-dst-ip",
    "src-dst-mac",
    "src-dst-port",
    "src-ip",
    "src-mac",
    "src-port",
];
const parseLinkAggBody = (body) => {
    const groupId = Number(body.groupId);
    if (!Number.isInteger(groupId) || groupId < 1 || groupId > 12)
        return { error: "Aggregation Group must be an integer between 1 and 12" };
    const mode = VALID_MODES.includes(body.mode) ? body.mode : null;
    if (!mode)
        return { error: `Mode must be one of: ${VALID_MODES.join(", ")}` };
    const memberPorts = Array.isArray(body.memberPorts)
        ? body.memberPorts.filter((p) => typeof p === "string" && p.trim().length > 0)
        : [];
    if (memberPorts.length === 0)
        return { error: "At least one member port is required" };
    return { data: { groupId, mode, memberPorts } };
};
// GET /api/v1/device/:id/link-aggregation
// Member-port assignment is DB-only (see model comment in schema.prisma), so "State" and
// "Valid Member Ports" are derived here from the device's latest telemetry rather than a
// stored field — a member port only counts as "valid"/bundled while it's actually link-up.
export const listLinkAggregations = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const [groups, latestTelemetry] = await Promise.all([
        prisma.linkAggregation.findMany({
            where: { deviceId: access.device.id },
            orderBy: { groupId: "asc" },
        }),
        prisma.telemetry.findFirst({
            where: { deviceId: access.device.id },
            orderBy: { createdAt: "desc" },
            include: { interfaceStats: true },
        }),
    ]);
    const upPorts = new Set((latestTelemetry?.interfaceStats ?? []).filter((s) => s.status === "up").map((s) => s.port));
    const linkAggregations = groups.map((g) => {
        const validMemberPorts = g.memberPorts.filter((p) => upPorts.has(p));
        return {
            ...g,
            validMemberPorts,
            state: validMemberPorts.length > 0 ? "up" : "down",
        };
    });
    return res
        .status(200)
        .json(new ApiResponse(200, { linkAggregations }, "Link aggregation groups fetched"));
});
// POST /api/v1/device/:id/link-aggregation
// Pushes "channel-group <id> mode <mode>" to the switch, one MQTT round-trip per member port
// (via the Pre-command interface-context mechanism — see commands/deviceCommands.ts). Only
// ports the switch actually confirmed are persisted; if none succeed, nothing is created.
export const createLinkAggregation = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const parsed = parseLinkAggBody(req.body);
    if ("error" in parsed)
        return res.status(400).json(new ApiResponse(400, {}, parsed.error));
    const { groupId, mode, memberPorts } = parsed.data;
    const existing = await prisma.linkAggregation.findFirst({
        where: { deviceId: device.id, groupId },
    });
    if (existing)
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Aggregation group ${groupId} already exists on this device`));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure link aggregation`));
    const commands = getDeviceCommands(device.model);
    const results = {};
    const confirmedPorts = [];
    for (const port of memberPorts) {
        try {
            const { requestId, response } = await runDeviceCommand(device, {
                ...commands.linkAggregation.assignPort({ kind: "single", port }, { groupId, mode }),
                logParams: { groupId, mode, port },
            });
            if (response.status !== 0) {
                results[port] = { applied: false, requestId, message: response.message || "Switch rejected the command" };
            }
            else {
                results[port] = { applied: true, requestId };
                confirmedPorts.push(port);
            }
        }
        catch (err) {
            const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
            results[port] = { applied: false, requestId, message: "Device did not respond in time" };
        }
    }
    if (confirmedPorts.length === 0)
        return res
            .status(422)
            .json(new ApiResponse(422, { results }, "The switch rejected every member port; aggregation group was not created"));
    const anyFailed = confirmedPorts.length < memberPorts.length;
    const linkAggregation = await prisma.linkAggregation.create({
        data: { deviceId: device.id, groupId, mode, memberPorts: confirmedPorts, deviceConfirmed: !anyFailed },
    });
    const statusCode = anyFailed ? 422 : 200;
    return res
        .status(statusCode)
        .json(new ApiResponse(statusCode, { linkAggregation, results }, anyFailed ? "Aggregation group created, but some member ports were rejected" : "Aggregation group created"));
});
// DELETE /api/v1/device/:id/link-aggregation/:laId
// Pushes "no channel-group" for every stored member port; the DB row is only removed once
// every port has been confirmed clear (same switch-first pattern as VLAN delete).
export const deleteLinkAggregation = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    const laId = req.params.laId;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    if (!laId)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: laId"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const existing = await prisma.linkAggregation.findFirst({
        where: { id: laId, deviceId: device.id },
    });
    if (!existing)
        return res.status(404).json(new ApiResponse(404, {}, "Aggregation group not found on this device"));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure link aggregation`));
    const commands = getDeviceCommands(device.model);
    const results = {};
    const stillMember = [];
    for (const port of existing.memberPorts) {
        try {
            const { requestId, response } = await runDeviceCommand(device, {
                ...commands.linkAggregation.unassignPort({ kind: "single", port }),
                logParams: { groupId: existing.groupId, port },
            });
            if (response.status !== 0) {
                results[port] = { applied: false, requestId, message: response.message || "Switch rejected the command" };
                stillMember.push(port);
            }
            else {
                results[port] = { applied: true, requestId };
            }
        }
        catch (err) {
            const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
            results[port] = { applied: false, requestId, message: "Device did not respond in time" };
            stillMember.push(port);
        }
    }
    if (stillMember.length > 0) {
        await prisma.linkAggregation.update({
            where: { id: existing.id },
            data: { memberPorts: stillMember, deviceConfirmed: false },
        });
        return res
            .status(422)
            .json(new ApiResponse(422, { results }, "Some member ports could not be removed from the channel group; the group was not deleted"));
    }
    await prisma.linkAggregation.delete({ where: { id: existing.id } });
    return res.status(200).json(new ApiResponse(200, { results }, "Aggregation group deleted"));
});
// GET /api/v1/device/:id/link-aggregation/load-balance
export const getLoadBalanceMethod = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    return res
        .status(200)
        .json(new ApiResponse(200, { method: access.device.loadBalanceMethod }, "Load balance method fetched"));
});
// PATCH /api/v1/device/:id/link-aggregation/load-balance
// This one IS pushed to the switch — "port-channel load-balance <method>" is a flat global
// command, not blocked by the interface-context limitation above.
export const updateLoadBalanceMethod = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const method = req.body?.method;
    if (typeof method !== "string" || !LOAD_BALANCE_METHODS.includes(method))
        return res
            .status(400)
            .json(new ApiResponse(400, {}, `method must be one of: ${LOAD_BALANCE_METHODS.join(", ")}`));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure this`));
    const commands = getDeviceCommands(device.model);
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.linkAggregation.setLoadBalance(method),
            logParams: { method },
        });
        if (response.status !== 0) {
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        }
        const updated = await prisma.device.update({
            where: { id: device.id },
            data: { loadBalanceMethod: method },
        });
        return res
            .status(200)
            .json(new ApiResponse(200, { method: updated.loadBalanceMethod, requestId }, "Load balance method updated"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res
            .status(504)
            .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// GET /api/v1/device/:id/link-aggregation/system-priority
export const getLacpSystemPriority = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    return res
        .status(200)
        .json(new ApiResponse(200, { priority: access.device.lacpSystemPriority }, "LACP system priority fetched"));
});
// PATCH /api/v1/device/:id/link-aggregation/system-priority
// "lacp system-priority" is a flat global command — not blocked by the interface-context
// limitation. CLI ref: "Configuring LACP System Priority" — modifying this affects every
// aggregation group on the device.
export const updateLacpSystemPriority = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const priority = req.body?.priority;
    if (typeof priority !== "number" ||
        !Number.isInteger(priority) ||
        priority < MIN_LACP_PRIORITY ||
        priority > MAX_LACP_PRIORITY)
        return res
            .status(400)
            .json(new ApiResponse(400, {}, `priority must be an integer between ${MIN_LACP_PRIORITY} and ${MAX_LACP_PRIORITY}`));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure this`));
    const commands = getDeviceCommands(device.model);
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.linkAggregation.setSystemPriority(priority),
            logParams: { priority },
        });
        if (response.status !== 0) {
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        }
        const updated = await prisma.device.update({
            where: { id: device.id },
            data: { lacpSystemPriority: priority },
        });
        return res
            .status(200)
            .json(new ApiResponse(200, { priority: updated.lacpSystemPriority, requestId }, "LACP system priority updated"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res
            .status(504)
            .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
//# sourceMappingURL=linkAggregationController.js.map