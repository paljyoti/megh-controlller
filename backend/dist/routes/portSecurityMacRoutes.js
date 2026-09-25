import { Router } from "express";
import { createPortSecurityMac, deletePortSecurityMac, listPortSecurityMacs, } from "../controllers/portSecurityController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";
const router = Router({ mergeParams: true });
// All routes require authentication
router.use(verifyUser);
router.get("/", listPortSecurityMacs);
router.post("/", requireRole("SUPERADMIN", "ADMIN"), createPortSecurityMac);
router.delete("/:entryId", requireRole("SUPERADMIN", "ADMIN"), deletePortSecurityMac);
export default router;
//# sourceMappingURL=portSecurityMacRoutes.js.map