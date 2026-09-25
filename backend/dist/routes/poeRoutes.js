import { Router } from "express";
import { getPoeSettings, updatePoePowerBudget, updatePoeLegacyMode, updatePoePowerAlarm, updatePoePowerReserved, } from "../controllers/poeController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";
const router = Router({ mergeParams: true });
// All routes require authentication
router.use(verifyUser);
router.get("/", getPoeSettings);
router.patch("/power-budget", requireRole("SUPERADMIN", "ADMIN"), updatePoePowerBudget);
router.patch("/legacy-mode", requireRole("SUPERADMIN", "ADMIN"), updatePoeLegacyMode);
router.patch("/power-alarm", requireRole("SUPERADMIN", "ADMIN"), updatePoePowerAlarm);
router.patch("/power-reserved", requireRole("SUPERADMIN", "ADMIN"), updatePoePowerReserved);
export default router;
//# sourceMappingURL=poeRoutes.js.map