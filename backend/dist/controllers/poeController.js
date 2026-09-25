import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands } from "../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../services/deviceCommand.js";
const findDeviceById = async (id) => {
    return prisma.device.findFirst({
        where: { OR: [{ id }, { serialNumber: id }] },
    });
};
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
// GET /api/v1/device/:id/poe
export const getPoeSettings = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const commands = getDeviceCommands(access.device.model);
    return res
        .status(200)
        .json(new ApiResponse(200, {
        powerBudget: access.device.poePowerBudget,
        // Global legacy mode is AC5-only — null on models (TR) that do it per-port instead.
        legacyMode: commands.poe.setLegacyMode ? access.device.poeLegacyMode : null,
        legacyModeGlobal: !!commands.poe.setLegacyMode,
        // TR-only globals — undefined-by-omission on models without them.
        powerAlarmPercent: commands.poe.setPowerAlarm ? access.device.poePowerAlarmPercent : undefined,
        powerReservedPercent: commands.poe.setPowerReserved ? access.device.poePowerReservedPercent : undefined,
    }, "PoE settings fetched"));
});
// PATCH /api/v1/device/:id/poe/power-budget
// Body: { watts: number | null } — null clears it back to the device's own default calculation
// (CLI ref: "no poe powersupply"). CLI ref: "Configurint the External Powersupply" — "If the
// configured power is less than the current device power consumption, power off the PD device
// on the port with the lower priority" — lowering the budget can deliberately cut power to
// connected devices, but that's the documented, intended behaviour rather than a destructive
// side effect, so this doesn't need a confirm flag the way L3/legacy-mode do.
export const updatePoePowerBudget = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const watts = req.body?.watts;
    if (watts !== null && (typeof watts !== "number" || !Number.isFinite(watts) || watts <= 0))
        return res.status(400).json(new ApiResponse(400, {}, "watts must be a positive number, or null to clear"));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure PoE`));
    const commands = getDeviceCommands(device.model);
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...(watts === null ? commands.poe.clearPowerSupply() : commands.poe.setPowerSupply(watts)),
            logParams: { watts },
        });
        if (response.status !== 0) {
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        }
        const updated = await prisma.device.update({ where: { id: device.id }, data: { poePowerBudget: watts } });
        return res
            .status(200)
            .json(new ApiResponse(200, { powerBudget: updated.poePowerBudget, requestId }, "PoE power budget updated"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// PATCH /api/v1/device/:id/poe/legacy-mode
// Body: { enabled: boolean, confirm: true }. CLI ref: "Enabling Powersupply Legacy Mode" —
// the doc explicitly warns this can burn a connected device if used on a port not attached to
// a PD, so it's gated behind an explicit confirm flag, same as risky L3 operations.
export const updatePoeLegacyMode = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const body = req.body;
    if (typeof body.enabled !== "boolean")
        return res.status(400).json(new ApiResponse(400, {}, "enabled must be a boolean"));
    if (body.enabled && body.confirm !== true)
        return res
            .status(400)
            .json(new ApiResponse(400, {}, "confirm must be true to enable PoE legacy mode — the switch itself warns this can damage a connected device if the port isn't attached to a PD"));
    const commands = getDeviceCommands(device.model);
    if (!commands.poe.setLegacyMode)
        return res
            .status(400)
            .json(new ApiResponse(400, {}, `PoE legacy mode is per-port on this device model (${device.model}), not global — use the port PoE settings instead`));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure PoE`));
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.poe.setLegacyMode(body.enabled),
            logParams: { enabled: body.enabled },
        });
        if (response.status !== 0) {
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        }
        const updated = await prisma.device.update({ where: { id: device.id }, data: { poeLegacyMode: body.enabled } });
        return res
            .status(200)
            .json(new ApiResponse(200, { legacyMode: updated.poeLegacyMode, requestId }, "PoE legacy mode updated"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// PATCH /api/v1/device/:id/poe/power-alarm — { percent: number | null } (50-99, null clears)
// TR models only — confirmed live: "poe power-alarm VALUE (50 to 99 percent)".
export const updatePoePowerAlarm = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const percent = req.body?.percent;
    if (percent !== null && (typeof percent !== "number" || !Number.isInteger(percent) || percent < 50 || percent > 99))
        return res.status(400).json(new ApiResponse(400, {}, "percent must be an integer between 50 and 99, or null to clear"));
    const commands = getDeviceCommands(device.model);
    if (!commands.poe.setPowerAlarm)
        return res.status(400).json(new ApiResponse(400, {}, `PoE power alarm is not supported on this device model (${device.model})`));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure PoE`));
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.poe.setPowerAlarm(percent),
            logParams: { percent },
        });
        if (response.status !== 0)
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        const updated = await prisma.device.update({ where: { id: device.id }, data: { poePowerAlarmPercent: percent } });
        return res
            .status(200)
            .json(new ApiResponse(200, { powerAlarmPercent: updated.poePowerAlarmPercent, requestId }, "PoE power alarm updated"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// PATCH /api/v1/device/:id/poe/power-reserved — { percent: number } (0-50)
// TR models only — confirmed live: "poe power-reserved VALUE (0 to 50 percent)".
export const updatePoePowerReserved = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const percent = req.body?.percent;
    if (typeof percent !== "number" || !Number.isInteger(percent) || percent < 0 || percent > 50)
        return res.status(400).json(new ApiResponse(400, {}, "percent must be an integer between 0 and 50"));
    const commands = getDeviceCommands(device.model);
    if (!commands.poe.setPowerReserved)
        return res.status(400).json(new ApiResponse(400, {}, `PoE power reserved is not supported on this device model (${device.model})`));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure PoE`));
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.poe.setPowerReserved(percent),
            logParams: { percent },
        });
        if (response.status !== 0)
            return res
                .status(422)
                .json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        const updated = await prisma.device.update({ where: { id: device.id }, data: { poePowerReservedPercent: percent } });
        return res
            .status(200)
            .json(new ApiResponse(200, { powerReservedPercent: updated.poePowerReservedPercent, requestId }, "PoE power reserved updated"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
//# sourceMappingURL=poeController.js.map