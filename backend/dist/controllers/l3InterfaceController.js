import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import { getDeviceCommands } from "../commands/deviceCommands.js";
import { runDeviceCommand, CommandTimeoutError } from "../services/deviceCommand.js";
// Helper: find device by DB id OR serialNumber (mirrors portController.ts)
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
const IPV4_CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
const IPV6_CIDR_RE = /^[0-9a-fA-F:]+\/\d{1,3}$/;
const isValidIpv4Cidr = (v) => {
    const m = v.match(IPV4_CIDR_RE);
    if (!m)
        return false;
    const octets = [m[1], m[2], m[3], m[4]].map(Number);
    const prefix = Number(m[5]);
    return octets.every((o) => o >= 0 && o <= 255) && prefix >= 0 && prefix <= 32;
};
const isValidIpv6Cidr = (v) => {
    if (!IPV6_CIDR_RE.test(v))
        return false;
    const [addr, prefixStr] = v.split("/");
    const prefix = Number(prefixStr);
    return !!addr && addr.includes(":") && prefix >= 0 && prefix <= 128;
};
const VALID_KINDS = ["svi", "routedPort"];
const targetFor = (row) => row.interfaceKind === "svi"
    ? { kind: "svi", vlanId: row.vlanId }
    : { kind: "single", port: row.port };
// GET /api/v1/device/:id/l3-interfaces
export const listL3Interfaces = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const l3Interfaces = await prisma.l3Interface.findMany({
        where: { deviceId: access.device.id },
        orderBy: { createdAt: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, { l3Interfaces }, "L3 interfaces fetched"));
});
// POST /api/v1/device/:id/l3-interfaces
// Body: { interfaceKind: "svi"|"routedPort", vlanId?, port?, ipv4Address?, ipv6Address?, confirm: true }
// CLI ref: "Configuring SVI Port IP/IPv6 Address" and "Configuring Routing Port IP/IPv6
// Address". The doc explicitly warns that setting an SVI's primary IP clears the platform's
// management IP config and replaces it — this can disconnect the controller from the switch —
// so `confirm: true` is mandatory. A routed port additionally requires "no switchport" first,
// which changes the port from Layer 2 to Layer 3 (also gated by the same confirm flag).
export const setL3Address = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    const body = req.body;
    if (body.confirm !== true)
        return res
            .status(400)
            .json(new ApiResponse(400, {}, "confirm must be true — setting an L3 address can change the device's management reachability"));
    const interfaceKind = body.interfaceKind;
    if (!VALID_KINDS.includes(interfaceKind))
        return res.status(400).json(new ApiResponse(400, {}, `interfaceKind must be one of: ${VALID_KINDS.join(", ")}`));
    let interfaceName;
    let vlanId = null;
    let port = null;
    let target;
    if (interfaceKind === "svi") {
        const v = body.vlanId;
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 4094)
            return res.status(400).json(new ApiResponse(400, {}, "vlanId must be an integer between 1 and 4094"));
        const vlan = await prisma.vlan.findFirst({ where: { deviceId: device.id, vlanId: v } });
        if (!vlan)
            return res.status(400).json(new ApiResponse(400, {}, `VLAN ${v} does not exist on this device — the SVI is auto-created/deleted with the VLAN`));
        vlanId = v;
        interfaceName = `vlan${v}`;
        target = { kind: "svi", vlanId: v };
    }
    else {
        const p = body.port;
        if (typeof p !== "string" || !p.trim())
            return res.status(400).json(new ApiResponse(400, {}, "port is required for interfaceKind 'routedPort'"));
        port = p.trim();
        interfaceName = port;
        target = { kind: "single", port };
    }
    const ipv4Address = typeof body.ipv4Address === "string" && body.ipv4Address.trim() ? body.ipv4Address.trim() : undefined;
    const ipv6Address = typeof body.ipv6Address === "string" && body.ipv6Address.trim() ? body.ipv6Address.trim() : undefined;
    if (!ipv4Address && !ipv6Address)
        return res.status(400).json(new ApiResponse(400, {}, "At least one of ipv4Address or ipv6Address is required"));
    if (ipv4Address && !isValidIpv4Cidr(ipv4Address))
        return res.status(400).json(new ApiResponse(400, {}, "ipv4Address must be in A.B.C.D/M form, e.g. 192.168.1.1/24"));
    if (ipv6Address && !isValidIpv6Cidr(ipv6Address))
        return res.status(400).json(new ApiResponse(400, {}, "ipv6Address must be in X:X::X:X/M form"));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure L3 addressing`));
    const existing = await prisma.l3Interface.findFirst({ where: { deviceId: device.id, interfaceName } });
    const commands = getDeviceCommands(device.model);
    const results = {};
    let anyFailed = false;
    const runStep = async (field, spec) => {
        try {
            const { requestId, response } = await runDeviceCommand(device, { ...spec, logParams: { interfaceName, field } });
            if (response.status !== 0) {
                results[field] = { applied: false, requestId, message: response.message || "Switch rejected the command" };
                anyFailed = true;
                return false;
            }
            results[field] = { applied: true, requestId };
            return true;
        }
        catch (err) {
            const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
            results[field] = { applied: false, requestId, message: "Device did not respond in time" };
            anyFailed = true;
            return false;
        }
    };
    // A routed port needs "no switchport" before it will accept an ip address command — only
    // needed once, so skip it if this port is already recorded as a routed L3 interface.
    let routedModeApplied = existing?.interfaceKind === "routedPort";
    if (interfaceKind === "routedPort" && !routedModeApplied) {
        routedModeApplied = await runStep("routedMode", commands.l3.setRoutedMode(target));
    }
    const canProceedWithIp = interfaceKind === "svi" || routedModeApplied;
    let ipv4Ok = false;
    let ipv6Ok = false;
    if (canProceedWithIp) {
        if (ipv4Address)
            ipv4Ok = await runStep("ipv4Address", commands.l3.setIpv4(target, ipv4Address));
        if (ipv6Address)
            ipv6Ok = await runStep("ipv6Address", commands.l3.setIpv6(target, ipv6Address));
    }
    else if (ipv4Address || ipv6Address) {
        // routedMode failed — record the IP fields as not-applied without sending them, since the
        // switch already rejected the prerequisite step.
        if (ipv4Address)
            results.ipv4Address = { applied: false, message: "Skipped — 'no switchport' was rejected" };
        if (ipv6Address)
            results.ipv6Address = { applied: false, message: "Skipped — 'no switchport' was rejected" };
        anyFailed = true;
    }
    const dbData = { interfaceKind, interfaceName, vlanId, port };
    if (ipv4Ok)
        dbData.ipv4Address = ipv4Address;
    if (ipv6Ok)
        dbData.ipv6Address = ipv6Address;
    dbData.deviceConfirmed = !anyFailed;
    if (!ipv4Ok && !ipv6Ok && !existing) {
        // Nothing succeeded and there's no prior row to preserve — don't create a confusing empty one.
        return res
            .status(422)
            .json(new ApiResponse(422, { results }, "The switch rejected the requested L3 address configuration"));
    }
    const row = await prisma.l3Interface.upsert({
        where: { deviceId_interfaceName: { deviceId: device.id, interfaceName } },
        create: {
            deviceId: device.id,
            interfaceKind: interfaceKind,
            interfaceName,
            vlanId,
            port,
            ipv4Address: (ipv4Ok ? ipv4Address : undefined) ?? null,
            ipv6Address: (ipv6Ok ? ipv6Address : undefined) ?? null,
            deviceConfirmed: !anyFailed,
        },
        update: dbData,
    });
    const statusCode = anyFailed ? 422 : 200;
    return res
        .status(statusCode)
        .json(new ApiResponse(statusCode, { l3Interface: row, results }, anyFailed ? "Some L3 address fields were rejected by the device" : "L3 address configured"));
});
// DELETE /api/v1/device/:id/l3-interfaces/:l3Id
// Body: { confirm: true }. Requires all secondary addresses to already be removed (CLI ref:
// "When deleting the primary ip, if the second ip already exists, you need to delete all the
// second ip before deleting the primary ip, otherwise it cannot be deleted."). A routed port
// is reverted to Layer 2 ("switchport") once both addresses are cleared.
export const deleteL3Address = asyncHandlers(async (req, res) => {
    const deviceParam = req.params.id;
    const l3Id = req.params.l3Id;
    if (!deviceParam)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: id"));
    if (!l3Id)
        return res.status(400).json(new ApiResponse(400, {}, "Missing route parameter: l3Id"));
    const access = await verifyDeviceAccess(req, deviceParam);
    if (!access.ok)
        return res.status(access.status).json(new ApiResponse(access.status, {}, access.message));
    const { device } = access;
    if (req.body?.confirm !== true)
        return res.status(400).json(new ApiResponse(400, {}, "confirm must be true to remove an L3 address"));
    const existing = await prisma.l3Interface.findFirst({ where: { id: l3Id, deviceId: device.id } });
    if (!existing)
        return res.status(404).json(new ApiResponse(404, {}, "L3 interface not found on this device"));
    if (existing.secondaryIpv4.length > 0 || existing.secondaryIpv6.length > 0)
        return res
            .status(409)
            .json(new ApiResponse(409, {}, "Remove all secondary addresses before deleting the primary address"));
    if (device.status !== "online")
        return res
            .status(409)
            .json(new ApiResponse(409, {}, `Device is ${device.status}; it must be online to configure L3 addressing`));
    const target = targetFor(existing);
    const commands = getDeviceCommands(device.model);
    const results = {};
    let anyFailed = false;
    const runStep = async (field, spec) => {
        try {
            const { requestId, response } = await runDeviceCommand(device, {
                ...spec,
                logParams: { interfaceName: existing.interfaceName, field },
            });
            if (response.status !== 0) {
                results[field] = { applied: false, requestId, message: response.message || "Switch rejected the command" };
                anyFailed = true;
                return false;
            }
            results[field] = { applied: true, requestId };
            return true;
        }
        catch (err) {
            const requestId = err instanceof CommandTimeoutError ? err.requestId : undefined;
            results[field] = { applied: false, requestId, message: "Device did not respond in time" };
            anyFailed = true;
            return false;
        }
    };
    if (existing.ipv4Address)
        await runStep("ipv4Address", commands.l3.clearIpv4(target, existing.ipv4Address));
    if (existing.ipv6Address)
        await runStep("ipv6Address", commands.l3.clearIpv6(target, existing.ipv6Address));
    if (existing.interfaceKind === "routedPort" && !anyFailed)
        await runStep("routedMode", commands.l3.clearRoutedMode(target));
    if (anyFailed) {
        return res
            .status(422)
            .json(new ApiResponse(422, { results }, "Some steps were rejected by the device; the L3 interface was not deleted"));
    }
    await prisma.l3Interface.delete({ where: { id: existing.id } });
    return res.status(200).json(new ApiResponse(200, { results }, "L3 address removed"));
});
// Secondary L3 addresses (POST/DELETE .../secondary) are intentionally NOT implemented.
// Live testing showed that re-running "ip address <addr>" on an interface that already has a
// primary address does not add a secondary — it silently REPLACES the primary, and the switch
// still returns success (status 0). The CLI reference describes "the second ip" conceptually
// but never gives the actual syntax to mark an address as secondary (unlike, e.g., Cisco's
// "ip address <addr> secondary" keyword) — there is no documented command to build here without
// guessing, and guessing already proved destructive once. Do not re-add this without a
// confirmed-working command from the CLI reference or a live test against the real switch.
//# sourceMappingURL=l3InterfaceController.js.map