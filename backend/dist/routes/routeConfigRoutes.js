import { Router } from "express";
import { createRouteConfig, deleteRouteConfig, listRouteConfigs, } from "../controllers/routeConfigController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";
const router = Router({ mergeParams: true });
// All routes require authentication
router.use(verifyUser);
router.get("/", listRouteConfigs);
router.post("/", requireRole("SUPERADMIN", "ADMIN"), createRouteConfig);
router.delete("/:routeId", requireRole("SUPERADMIN", "ADMIN"), deleteRouteConfig);
export default router;
//# sourceMappingURL=routeConfigRoutes.js.map