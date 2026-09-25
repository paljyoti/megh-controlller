import { Router } from "express";
import { createIpMacBinding, deleteIpMacBinding, listIpMacBindings, } from "../controllers/portSecurityController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";
const router = Router({ mergeParams: true });
// All routes require authentication
router.use(verifyUser);
router.get("/", listIpMacBindings);
router.post("/", requireRole("SUPERADMIN", "ADMIN"), createIpMacBinding);
router.delete("/:bindingId", requireRole("SUPERADMIN", "ADMIN"), deleteIpMacBinding);
export default router;
//# sourceMappingURL=portSecurityRoutes.js.map