import prisma from "../db/client.js";
import { notifyResponse } from "../services/commandWaiter.js";
// Parses the free-text "show version" response, e.g.:
// "Software Version: xxxx \n Release Date: ... \n System MAC Address: 70:98:cd:bb:98:50\n PID: xxxx , Hardware Version: 1.0, Serial Number: xxxx \n Vendor oid: xxxx"
const parseShowVersion = (text) => {
    const field = (label) => {
        const match = text.match(new RegExp(`${label}:\\s*([^\\n,]+)`, "i"));
        return match?.[1] ? match[1].trim() : null;
    };
    return {
        model: field("PID"),
        macAddress: field("System MAC Address"),
        hardwareVersion: field("Hardware Version"),
        softwareVersion: field("Software Version"),
    };
};
/*
  Handles switch/<sn>/response
  Updates the matching CommandLog with the switch's response data.
  Also handles file_transfer progress updates (status=4 means in-progress).
 */
const responseHandler = async (serialNumber, data) => {
    try {
        console.log(`[response] Response from ${serialNumber} for request ${data.request_id}:`, data);
        const existing = await prisma.commandLog.findUnique({
            where: { requestId: data.request_id },
        });
        if (!existing) {
            console.warn(`[response] No CommandLog found for request_id: ${data.request_id}`);
            return;
        }
        // status=4 means device is busy / in-progress (file transfer progress update)
        if (data.status === 4) {
            const progressData = data.data;
            const progressValue = progressData && typeof progressData === "object" && "progress" in progressData
                ? String(progressData.progress ?? "in-progress")
                : "in-progress";
            await prisma.commandLog.update({
                where: { requestId: data.request_id },
                data: {
                    progress: progressValue,
                    responseStatus: data.status,
                    responseMessage: data.message,
                },
            });
            console.log(`[response] File transfer progress for ${data.request_id}: ${progressValue}`);
            return;
        }
        // Final response — update with full result
        await prisma.commandLog.update({
            where: { requestId: data.request_id },
            data: {
                responseStatus: data.status,
                responseMessage: data.message,
                responseData: data.data ?? {},
                progress: data.status === 0 ? "completed" : "failed",
            },
        });
        console.log(`[response] CommandLog updated for ${data.request_id} — status: ${data.status}, message: ${data.message}`);
        // Wake up any HTTP handler awaiting this request_id (e.g. VLAN create/delete)
        notifyResponse(data.request_id, data);
        // Backfill device identity fields recovered via "show version" (see telemetryHandler)
        if (existing.command === "show version" && data.status === 0 && typeof data.data === "string") {
            const parsed = parseShowVersion(data.data);
            const updateData = {};
            if (parsed.model)
                updateData.model = parsed.model;
            if (parsed.macAddress)
                updateData.macAddress = parsed.macAddress;
            if (parsed.hardwareVersion)
                updateData.hardwareVersion = parsed.hardwareVersion;
            if (parsed.softwareVersion)
                updateData.softwareVersion = parsed.softwareVersion;
            if (Object.keys(updateData).length > 0) {
                await prisma.device.update({
                    where: { id: existing.deviceId },
                    data: updateData,
                });
                console.log(`[response] Backfilled device identity for ${serialNumber} from 'show version':`, updateData);
            }
        }
    }
    catch (err) {
        console.error(`[response] Error handling response for ${serialNumber}:`, err);
    }
};
export default responseHandler;
//# sourceMappingURL=responseHandler.js.map