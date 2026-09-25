import { Router } from "express";
import { getSystemSettings, updateHostname, updateNtpServer, updateTimezone, updateWebServer, updateTelnetServer, updateSshServer, updateManagementIp, updateManagementIpv6, writeConfig, reloadDevice, factoryRestore, } from "../controllers/systemController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";
const router = Router({ mergeParams: true });
// All routes require authentication
router.use(verifyUser);
router.get("/", getSystemSettings);
router.patch("/hostname", requireRole("SUPERADMIN", "ADMIN"), updateHostname);
router.patch("/ntp", requireRole("SUPERADMIN", "ADMIN"), updateNtpServer);
router.patch("/timezone", requireRole("SUPERADMIN", "ADMIN"), updateTimezone);
router.patch("/web-server", requireRole("SUPERADMIN", "ADMIN"), updateWebServer);
router.patch("/telnet-server", requireRole("SUPERADMIN", "ADMIN"), updateTelnetServer);
router.patch("/ssh-server", requireRole("SUPERADMIN", "ADMIN"), updateSshServer);
router.patch("/management-ip", requireRole("SUPERADMIN", "ADMIN"), updateManagementIp);
router.patch("/management-ipv6", requireRole("SUPERADMIN", "ADMIN"), updateManagementIpv6);
router.post("/write", requireRole("SUPERADMIN", "ADMIN"), writeConfig);
router.post("/reload", requireRole("SUPERADMIN", "ADMIN"), reloadDevice);
router.post("/factory-restore", requireRole("SUPERADMIN", "ADMIN"), factoryRestore);
export default router;
//# sourceMappingURL=systemRoutes.js.map