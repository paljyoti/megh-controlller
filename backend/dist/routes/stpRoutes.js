import { Router } from "express";
import { getStpSettings, updateStpMode, updateStpEnabled, updateStpTimers } from "../controllers/stpController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";
const router = Router({ mergeParams: true });
router.use(verifyUser);
router.get("/", getStpSettings);
router.patch("/mode", requireRole("SUPERADMIN", "ADMIN"), updateStpMode);
router.patch("/enabled", requireRole("SUPERADMIN", "ADMIN"), updateStpEnabled);
router.patch("/timers", requireRole("SUPERADMIN", "ADMIN"), updateStpTimers);
export default router;
//# sourceMappingURL=stpRoutes.js.map