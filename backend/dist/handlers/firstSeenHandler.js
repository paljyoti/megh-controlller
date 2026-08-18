import prisma from "../db/client.js";
/*
  Handles switch/<sn>/first_seen
  Auto-creates or updates the device record for onboarding/discovery.
 */
const firstSeenHandler = async (serialNumber, data) => {
    try {
        console.log(`[firstSeen] Device discovered: ${serialNumber}`, data);
        const existing = await prisma.device.findUnique({
            where: { serialNumber },
        });
        if (existing) {
            // Update the device with latest connection info
            await prisma.device.update({
                where: { serialNumber },
                data: {
                    macAddress: data.mac_address,
                    hardwareVersion: data.hardware_version,
                    softwareVersion: data.software_version,
                    ipAddress: data.ip_address,
                    model: data.model,
                    status: "online",
                },
            });
            console.log(`[firstSeen] Updated existing device: ${serialNumber}`);
        }
        else {
            // Auto-create device — not yet assigned to an org
            await prisma.device.create({
                data: {
                    serialNumber,
                    name: data.model ?? serialNumber,
                    model: data.model,
                    macAddress: data.mac_address,
                    hardwareVersion: data.hardware_version,
                    softwareVersion: data.software_version,
                    ipAddress: data.ip_address,
                    status: "online",
                    // organizationId is intentionally null until assigned by admin
                },
            });
            console.log(`[firstSeen] Auto-registered new device: ${serialNumber}`);
        }
    }
    catch (err) {
        console.error(`[firstSeen] Error handling first_seen for ${serialNumber}:`, err);
    }
};
export default firstSeenHandler;
//# sourceMappingURL=firstSeenHandler.js.map