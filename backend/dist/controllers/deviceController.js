import mqttClient from "../config/mqttConfig.js";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { v4 as uuidv4 } from "uuid";
import { publishCommand } from "../services/deviceCommand.js";
// Helper: find device by DB id OR serialNumber 
const findDeviceById = async (id) => {
    return prisma.device.findFirst({
        where: { OR: [{ id }, { serialNumber: id }] },
    });
};
// Helper: safe params accessor
const getParam = (req, key) => {
    const val = req.params[key];
    if (!val)
        throw new ApiError(400, `Missing route parameter: ${key}`);
    return val;
};
// Helper: verify device access based on user role   
const verifyDeviceAccess = async (req, deviceId) => {
    const device = await findDeviceById(deviceId);
    if (!device)
        throw new ApiError(404, "Device not found");
    if (!req.user)
        throw new ApiError(401, "unauthorized request");
    if (req.user.role === "SUPERADMIN")
        return device;
    if (req.user.role === "ADMIN") {
        if (device.organizationId !== req.user.orgs?.id)
            throw new ApiError(403, "Access denied: device not in your organization");
        return device;
    }
    if (device.assignedToId !== req.user.id)
        throw new ApiError(403, "Access denied: device not assigned to you");
    return device;
};
// GET /api/v1/device
export const getAllDevices = asyncHandlers(async (req, res) => {
    if (!req.user)
        throw new ApiError(401, "unauthorized request");
    let where = {};
    if (req.user.role === "ADMIN") {
        where = { organizationId: req.user.orgs?.id };
    }
    else if (req.user.role === "USER") {
        where = { assignedToId: req.user.id };
    }
    const devices = await prisma.device.findMany({
        where,
        include: {
            orgs: { select: { id: true, name: true } },
            assignedTo: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
    });
    return res.status(200).json(new ApiResponse(200, { devices }, "All devices fetched"));
});
// GET /api/v1/device/:id/telemetry
export const getTelemetry = asyncHandlers(async (req, res) => {
    const device = await verifyDeviceAccess(req, getParam(req, "id"));
    const latest = await prisma.telemetry.findFirst({
        where: { deviceId: device.id },
        orderBy: { createdAt: "desc" },
        include: { interfaceStats: true },
    });
    if (!latest)
        throw new ApiError(404, "No telemetry data found for this device");
    const serialized = {
        ...latest,
        timestamp: latest.timestamp.toString(),
        interfaceStats: latest.interfaceStats.map((s) => ({
            ...s,
            rxBytes: s.rxBytes.toString(),
            txBytes: s.txBytes.toString(),
            rxPackets: s.rxPackets.toString(),
            txPackets: s.txPackets.toString(),
        })),
    };
    return res.status(200).json(new ApiResponse(200, { telemetry: serialized }, "Telemetry fetched"));
});
// GET /api/v1/device/:id/events
export const getEvents = asyncHandlers(async (req, res) => {
    const device = await verifyDeviceAccess(req, getParam(req, "id"));
    const limit = Number(req.query.limit) || 50;
    const events = await prisma.deviceEvent.findMany({
        where: { deviceId: device.id },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    const serialized = events.map((e) => ({ ...e, timestamp: e.timestamp.toString() }));
    return res.status(200).json(new ApiResponse(200, { events: serialized }, "Events fetched"));
});
// GET /api/v1/device/:id/status
export const getStatus = asyncHandlers(async (req, res) => {
    const device = await verifyDeviceAccess(req, getParam(req, "id"));
    const latest = await prisma.deviceStatus.findFirst({
        where: { deviceId: device.id },
        orderBy: { createdAt: "desc" },
    });
    const serialized = latest ? { ...latest, uptime: latest.uptime.toString() } : null;
    return res
        .status(200)
        .json(new ApiResponse(200, { currentStatus: device.status, latestRecord: serialized }, "Status fetched"));
});
// GET /api/v1/device/:id/status-history
export const getStatusHistory = asyncHandlers(async (req, res) => {
    const device = await verifyDeviceAccess(req, getParam(req, "id"));
    const limit = Number(req.query.limit) || 50;
    const history = await prisma.deviceStatus.findMany({
        where: { deviceId: device.id },
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    const serialized = history.map((h) => ({ ...h, uptime: h.uptime.toString() }));
    return res.status(200).json(new ApiResponse(200, { history: serialized }, "Status history fetched"));
});
// POST /api/v1/device/:id/command
export const sendCommand = asyncHandlers(async (req, res) => {
    const device = await verifyDeviceAccess(req, getParam(req, "id"));
    const { command, mode, params = {} } = req.body;
    if (!command)
        throw new ApiError(400, "command field is required");
    if (mode !== "exec" && mode !== "config")
        throw new ApiError(400, "mode must be 'exec' or 'config'");
    const { requestId, commandLogId } = await publishCommand(device, { command, mode, params });
    return res.status(200).json(new ApiResponse(200, { requestId, commandLogId }, "Command sent to device"));
});
// POST /api/v1/device/broadcast
export const broadcastCommand = asyncHandlers(async (req, res) => {
    const { command, mode, params = {} } = req.body;
    if (!command)
        throw new ApiError(400, "command field is required");
    if (mode !== "exec" && mode !== "config")
        throw new ApiError(400, "mode must be 'exec' or 'config'");
    const requestId = `broadcast_${uuidv4().replace(/-/g, "").slice(0, 10)}`;
    const payload = { request_id: requestId, command, mode, params };
    mqttClient.publish("switch/all/request", JSON.stringify(payload), { qos: 1 });
    return res.status(200).json(new ApiResponse(200, { requestId }, "Broadcast command sent to all switches"));
});
// POST /api/v1/device/:id/file-transfer
export const fileTransfer = asyncHandlers(async (req, res) => {
    const device = await verifyDeviceAccess(req, getParam(req, "id"));
    const { file_type, file_url, algorithm, checksum, version } = req.body;
    if (!file_type || !file_url || !algorithm || !checksum) {
        throw new ApiError(400, "file_type, file_url, algorithm, and checksum are required");
    }
    const validFileTypes = [
        "firmware",
        "backup_configuration",
        "restore_configuration",
        "restore_certificate",
        "restore_privateKey",
    ];
    if (!validFileTypes.includes(file_type))
        throw new ApiError(400, `Invalid file_type. Must be one of: ${validFileTypes.join(", ")}`);
    const validAlgorithms = ["MD5", "SHA1", "SHA256", "SHA512"];
    if (!validAlgorithms.includes(algorithm))
        throw new ApiError(400, `Invalid algorithm. Must be one of: ${validAlgorithms.join(", ")}`);
    const requestId = `file_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
    // Build payload — only include version if provided
    const payload = version
        ? { request_id: requestId, file_type, file_url, algorithm, checksum, version }
        : { request_id: requestId, file_type, file_url, algorithm, checksum };
    mqttClient.publish(`switch/${device.serialNumber}/file_transfer`, JSON.stringify(payload), { qos: 1 });
    const log = await prisma.commandLog.create({
        data: {
            deviceId: device.id,
            requestId,
            command: "file_transfer",
            params: {},
            fileType: file_type,
            fileUrl: file_url,
            algorithm,
            checksum,
            version: version ?? null,
            progress: "sent",
        },
    });
    return res
        .status(200)
        .json(new ApiResponse(200, { requestId, commandLogId: log.id }, "File transfer request sent to device"));
});
// GET /api/v1/device/:id/command/:requestId
export const getCommandStatus = asyncHandlers(async (req, res) => {
    const id = getParam(req, "id");
    const requestId = getParam(req, "requestId");
    const device = await verifyDeviceAccess(req, id);
    const log = await prisma.commandLog.findFirst({
        where: { requestId, deviceId: device.id },
    });
    if (!log)
        throw new ApiError(404, "Command log not found");
    return res.status(200).json(new ApiResponse(200, { commandLog: log }, "Command status fetched"));
});
// GET /api/v1/device/onboard
export const getUnassignedDevices = asyncHandlers(async (req, res) => {
    if (!req.user)
        throw new ApiError(401, "unauthorized request");
    if (req.user.role === "USER")
        throw new ApiError(403, "Users cannot access onboard list");
    const devices = await prisma.device.findMany({
        where: { organizationId: null },
        orderBy: { createdAt: "desc" },
    });
    return res.status(200).json(new ApiResponse(200, { devices }, "Unassigned devices fetched"));
});
// POST /api/v1/device/assign
export const assignDevice = asyncHandlers(async (req, res) => {
    if (!req.user)
        throw new ApiError(401, "unauthorized request");
    if (req.user.role === "USER")
        throw new ApiError(403, "Users cannot assign devices");
    const { deviceId, organizationId, userId } = req.body;
    if (!deviceId)
        throw new ApiError(400, "deviceId is required");
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device)
        throw new ApiError(404, "Device not found");
    if (req.user.role === "SUPERADMIN") {
        if (!organizationId)
            throw new ApiError(400, "organizationId required for SUPERADMIN assignment");
        const org = await prisma.organization.findUnique({ where: { id: organizationId } });
        if (!org)
            throw new ApiError(404, "Organization not found");
        if (userId) {
            const targetUser = await prisma.user.findUnique({ where: { id: userId } });
            if (!targetUser || targetUser.organizationId !== organizationId)
                throw new ApiError(400, "Target user not in the specified organization");
        }
        const updated = await prisma.device.update({
            where: { id: deviceId },
            data: { organizationId, assignedToId: userId || null },
        });
        return res.status(200).json(new ApiResponse(200, { device: updated }, "Device assigned"));
    }
    // ADMIN flow
    if (!req.user.orgs?.id)
        throw new ApiError(400, "Admin has no organization");
    if (device.organizationId === null) {
        const data = { organizationId: req.user.orgs.id };
        if (userId) {
            const targetUser = await prisma.user.findUnique({ where: { id: userId } });
            if (!targetUser || targetUser.organizationId !== req.user.orgs.id)
                throw new ApiError(400, "Target user not in your organization");
            data.assignedToId = userId;
        }
        const updated = await prisma.device.update({ where: { id: deviceId }, data });
        return res.status(200).json(new ApiResponse(200, { device: updated }, "Device assigned to your org"));
    }
    if (device.organizationId === req.user.orgs.id) {
        if (!userId)
            throw new ApiError(400, "userId required to reassign within org");
        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!targetUser || targetUser.organizationId !== req.user.orgs.id)
            throw new ApiError(400, "Target user not in your organization");
        const updated = await prisma.device.update({
            where: { id: deviceId },
            data: { assignedToId: userId },
        });
        return res.status(200).json(new ApiResponse(200, { device: updated }, "Device assigned to user"));
    }
    throw new ApiError(403, "Cannot assign device from another organization");
});
// POST /api/v1/device/unassign
export const unassignDevice = asyncHandlers(async (req, res) => {
    if (!req.user)
        throw new ApiError(401, "unauthorized request");
    if (req.user.role === "USER")
        throw new ApiError(403, "Users cannot unassign devices");
    const { deviceId } = req.body;
    if (!deviceId)
        throw new ApiError(400, "deviceId is required");
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device)
        throw new ApiError(404, "Device not found");
    if (req.user.role === "ADMIN") {
        if (device.organizationId !== req.user.orgs?.id)
            throw new ApiError(403, "Cannot unassign device from another organization");
    }
    const updated = await prisma.device.update({
        where: { id: deviceId },
        data: { organizationId: null, assignedToId: null },
    });
    return res.status(200).json(new ApiResponse(200, { device: updated }, "Device unassigned"));
});
//# sourceMappingURL=deviceController.js.map