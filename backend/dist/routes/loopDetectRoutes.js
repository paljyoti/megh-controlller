import { Router } from "express";
import { getLoopDetectSettings, updateLoopDetectGlobal, updateLoopDetectInterval, updateLoopDetectTrap, updateErrdisableTimeout, recoverErrdisablePort, } from "../controllers/loopDetectController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";
const router = Router({ mergeParams: true });
router.use(verifyUser);
router.get("/", getLoopDetectSettings);
router.patch("/global", requireRole("SUPERADMIN", "ADMIN"), updateLoopDetectGlobal);
router.patch("/interval", requireRole("SUPERADMIN", "ADMIN"), updateLoopDetectInterval);
router.patch("/trap", requireRole("SUPERADMIN", "ADMIN"), updateLoopDetectTrap);
router.patch("/errdisable-timeout", requireRole("SUPERADMIN", "ADMIN"), updateErrdisableTimeout);
router.post("/recover", requireRole("SUPERADMIN", "ADMIN"), recoverErrdisablePort);
export default router;
//# sourceMappingURL=loopDetectRoutes.js.map