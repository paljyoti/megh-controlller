import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands, getDeviceCapabilities } from "../commands/deviceCommands.js";
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
// STP has no equivalent in AC5's CLI reference — commands.stp is undefined for any model
// without it. Every handler checks this first so an unsupported device gets a clear 400
// instead of a crash on `commands.stp.foo(...)`.
const requireSupport = (device, res) => {
    if (!getDeviceCapabilities(device.model).stp) {
        res.status(400).json(new ApiResponse(400, {}, `STP is not supported on this device model (${device.model})`));
        return false;
    }
    return true;
};
const requireOnline = (device, res) => {
    if (device.status !== "online") {
        res.status(409).json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure this`));
        return false;
    }
    return true;
};
const VALID_MODES = ["stp", "rstp", "mstp"];
// GET /api/v1/device/:id/stp
export const getStpSettings = asyncHandlers(async (req, res) => {
    const access = await verifyDeviceAccess(req, req.params.id);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const d = access.device;
    return res.status(200).json(new ApiResponse(200, {
        supported: getDeviceCapabilities(d.model).stp,
        mode: d.stpMode,
        enabled: d.stpEnabled,
        priority: d.stpPriority,
        helloTime: d.stpHelloTime,
        forwardDelay: d.stpForwardDelay,
        maxAge: d.stpMaxAge,
    }, "STP settings fetched"));
});
// PATCH /api/v1/device/:id/stp/mode — { mode: "stp"|"rstp"|"mstp" }
// CLI ref: "After the mode is switched, the spanning tree protocol is disabled by default and
// needs to be re-enabled" — mirrored here: switching mode also flips stpEnabled to false in the
// DB so the UI doesn't show a stale "enabled" state the switch no longer agrees with.
export const updateStpMode = asyncHandlers(async (req, res) => {
    const access = await verifyDeviceAccess(req, req.params.id);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    if (!requireSupport(device, res))
        return;
    const mode = req.body?.mode;
    if (!VALID_MODES.includes(mode))
        return res.status(400).json(new ApiResponse(400, {}, `mode must be one of: ${VALID_MODES.join(", ")}`));
    if (!requireOnline(device, res))
        return;
    const commands = getDeviceCommands(device.model);
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.stp.setMode(mode),
            logParams: { mode },
        });
        if (response.status !== 0)
            return res.status(422).json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        const updated = await prisma.device.update({ where: { id: device.id }, data: { stpMode: mode, stpEnabled: false } });
        return res.status(200).json(new ApiResponse(200, { mode: updated.stpMode, enabled: updated.stpEnabled, requestId }, "STP mode updated"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// PATCH /api/v1/device/:id/stp/enabled — { enabled: boolean }
export const updateStpEnabled = asyncHandlers(async (req, res) => {
    const access = await verifyDeviceAccess(req, req.params.id);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    if (!requireSupport(device, res))
        return;
    const enabled = req.body?.enabled;
    if (typeof enabled !== "boolean")
        return res.status(400).json(new ApiResponse(400, {}, "enabled must be a boolean"));
    if (!requireOnline(device, res))
        return;
    const commands = getDeviceCommands(device.model);
    try {
        const { requestId, response } = await runDeviceCommand(device, {
            ...commands.stp.setEnabled(enabled),
            logParams: { enabled },
        });
        if (response.status !== 0)
            return res.status(422).json(new ApiResponse(422, { requestId, switchStatus: response.status }, response.message || "Switch rejected the command"));
        const updated = await prisma.device.update({ where: { id: device.id }, data: { stpEnabled: enabled } });
        return res.status(200).json(new ApiResponse(200, { enabled: updated.stpEnabled, requestId }, "STP enabled setting updated"));
    }
    catch (err) {
        const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
        return res.status(504).json(new ApiResponse(504, { requestId }, "Device did not respond in time"));
    }
});
// PATCH /api/v1/device/:id/stp/timers — { priority?, helloTime?, forwardDelay?, maxAge? }
// CLI ref constraint: 2*(Hello Time + 1.0s) <= Max-Age Time <= 2*(Forward-Delay - 1.0s),
// "otherwise it may lead to topology instability" — enforced here before pushing anything.
export const updateStpTimers = asyncHandlers(async (req, res) => {
    const access = await verifyDeviceAccess(req, req.params.id);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    if (!requireSupport(device, res))
        return;
    const body = req.body;
    if (body.priority !== undefined && (typeof body.priority !== "number" || !Number.isInteger(body.priority) || body.priority < 0 || body.priority > 61440))
        return res.status(400).json(new ApiResponse(400, {}, "priority must be an integer between 0 and 61440"));
    if (body.helloTime !== undefined && (typeof body.helloTime !== "number" || !Number.isInteger(body.helloTime) || body.helloTime < 1 || body.helloTime > 10))
        return res.status(400).json(new ApiResponse(400, {}, "helloTime must be an integer between 1 and 10"));
    if (body.forwardDelay !== undefined && (typeof body.forwardDelay !== "number" || !Number.isInteger(body.forwardDelay) || body.forwardDelay < 4 || body.forwardDelay > 30))
        return res.status(400).json(new ApiResponse(400, {}, "forwardDelay must be an integer between 4 and 30"));
    if (body.maxAge !== undefined && (typeof body.maxAge !== "number" || !Number.isInteger(body.maxAge) || body.maxAge < 6 || body.maxAge > 40))
        return res.status(400).json(new ApiResponse(400, {}, "maxAge must be an integer between 6 and 40"));
    const helloTime = body.helloTime ?? device.stpHelloTime;
    const forwardDelay = body.forwardDelay ?? device.stpForwardDelay;
    const maxAge = body.maxAge ?? device.stpMaxAge;
    if (!(2 * (helloTime + 1) <= maxAge && maxAge <= 2 * (forwardDelay - 1)))
        return res
            .status(400)
            .json(new ApiResponse(400, {}, `Timers must satisfy 2*(helloTime+1) <= maxAge <= 2*(forwardDelay-1) — got hello=${helloTime}, forwardDelay=${forwardDelay}, maxAge=${maxAge}`));
    if (!requireOnline(device, res))
        return;
    const commands = getDeviceCommands(device.model);
    const steps = [];
    if (body.priority !== undefined)
        steps.push({ field: "priority", spec: commands.stp.setPriority(body.priority), dbField: "stpPriority", value: body.priority });
    if (body.helloTime !== undefined)
        steps.push({ field: "helloTime", spec: commands.stp.setHelloTime(body.helloTime), dbField: "stpHelloTime", value: body.helloTime });
    if (body.forwardDelay !== undefined)
        steps.push({ field: "forwardDelay", spec: commands.stp.setForwardDelay(body.forwardDelay), dbField: "stpForwardDelay", value: body.forwardDelay });
    if (body.maxAge !== undefined)
        steps.push({ field: "maxAge", spec: commands.stp.setMaxAge(body.maxAge), dbField: "stpMaxAge", value: body.maxAge });
    if (steps.length === 0)
        return res.status(400).json(new ApiResponse(400, {}, "At least one of priority, helloTime, forwardDelay, maxAge is required"));
    const results = {};
    const dbData = {};
    let anyFailed = false;
    for (const step of steps) {
        try {
            const { requestId, response } = await runDeviceCommand(device, { ...step.spec, logParams: { [step.field]: step.value } });
            if (response.status !== 0) {
                results[step.field] = { applied: false, requestId, message: response.message || "Switch rejected the command" };
                anyFailed = true;
            }
            else {
                results[step.field] = { applied: true, requestId };
                dbData[step.dbField] = step.value;
            }
        }
        catch (err) {
            const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
            results[step.field] = { applied: false, requestId, message: "Device did not respond in time" };
            anyFailed = true;
        }
    }
    const updated = await prisma.device.update({ where: { id: device.id }, data: dbData });
    const statusCode = anyFailed ? 422 : 200;
    return res.status(statusCode).json(new ApiResponse(statusCode, {
        priority: updated.stpPriority,
        helloTime: updated.stpHelloTime,
        forwardDelay: updated.stpForwardDelay,
        maxAge: updated.stpMaxAge,
        results,
    }, anyFailed ? "Some STP timers were rejected by the device" : "STP timers updated"));
});
//# sourceMappingURL=stpController.js.map