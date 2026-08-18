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
const isValidVlanId = (value) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4094;
const parseVlanId = (raw) => {
    const num = typeof raw === "string" ? Number(raw) : raw;
    return isValidVlanId(num) ? num : null;
};
// POST /api/v1/device/:id/vlan
export const createVlan = asyncHandlers(async (req, res) => {
    console.log(" createVlan API called");
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const { vlanId: vlanIdRaw, name: nameRaw } = req.body;
    if (vlanIdRaw === undefined || vlanIdRaw === null || vlanIdRaw === "")
        return res.status(400).json(new ApiResponse(400, {}, "vlanId is required"));
    const vlanId = parseVlanId(vlanIdRaw);
    if (vlanId === null)
        return res
            .status(400)
            .json(new ApiResponse(400, {}, "vlanId must be an integer between 1 and 4094"));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure VLANs`));
    const existingVlan = await prisma.vlan.findFirst({ where: { deviceId: device.id, vlanId } });
    if (existingVlan)
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `VLAN ${vlanId} already exists on this device`));
    const commands = getDeviceCommands(device.model);
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.vlan.create(vlanId),
            logParams: { vlanId },
        });
        if (response.status !== 0) {
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        }
        const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : `VLAN${vlanId}`;
        const vlan = await prisma.vlan.create({
            data: { name, vlanId, deviceId: device.id },
        });
        return res.status(200).json(new ApiResponse(200, { vlan, requestId }, "VLAN created successfully"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res
            .status(504)
            .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// DELETE /api/v1/device/:id/vlan/:vlanId
export const deleteVlan = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    const vlanIdParam = req.params.vlanId;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    if (!vlanIdParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: vlanId"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const vlanId = parseVlanId(vlanIdParam);
    if (vlanId === null)
        return res
            .status(400)
            .json(new ApiResponse(400, {}, "vlanId must be an integer between 1 and 4094"));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure VLANs`));
    const existingVlan = await prisma.vlan.findFirst({ where: { deviceId: device.id, vlanId } });
    if (!existingVlan)
        return res.status(404).json(new ApiResponse(404, {}, `VLAN ${vlanId} not found on this device`));
    const commands = getDeviceCommands(device.model);
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.vlan.delete(vlanId),
            logParams: { vlanId },
        });
        if (response.status !== 0) {
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        }
        await prisma.vlan.delete({ where: { id: existingVlan.id } });
        return res.status(200).json(new ApiResponse(200, { requestId }, "VLAN deleted successfully"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res
            .status(504)
            .json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// PATCH /api/v1/device/:id/vlan/:vlanId
// DB-only update: VLAN name is a platform-side label, not pushed to the switch (no CLI
// command for it).
export const updateVlan = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    const vlanIdParam = req.params.vlanId;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    if (!vlanIdParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: vlanId"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const vlanId = parseVlanId(vlanIdParam);
    if (vlanId === null)
        return res
            .status(400)
            .json(new ApiResponse(400, {}, "vlanId must be an integer between 1 and 4094"));
    const existingVlan = await prisma.vlan.findFirst({ where: { deviceId: device.id, vlanId } });
    if (!existingVlan)
        return res.status(404).json(new ApiResponse(404, {}, `VLAN ${vlanId} not found on this device`));
    const { name } = req.body;
    if (typeof name !== "string" || !name.trim())
        return res.status(400).json(new ApiResponse(400, {}, "name must be a non-empty string"));
    const data = { name: name.trim() };
    const vlan = await prisma.vlan.update({ where: { id: existingVlan.id }, data });
    return res.status(200).json(new ApiResponse(200, { vlan }, "VLAN updated"));
});
// GET /api/v1/device/:id/vlan
export const listVlans = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const vlans = await prisma.vlan.findMany({
        where: { deviceId: access.device.id },
        orderBy: { vlanId: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, { vlans }, "VLANs fetched"));
});
//# sourceMappingURL=vlanController.js.map