import { Router } from "express";
import { listL3Interfaces, setL3Address, deleteL3Address } from "../controllers/l3InterfaceController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";
const router = Router({ mergeParams: true });
// All routes require authentication
router.use(verifyUser);
router.get("/", listL3Interfaces);
router.post("/", requireRole("SUPERADMIN", "ADMIN"), setL3Address);
router.delete("/:l3Id", requireRole("SUPERADMIN", "ADMIN"), deleteL3Address);
// No secondary-address routes — see the comment at the bottom of l3InterfaceController.ts.
export default router;
//# sourceMappingURL=l3InterfaceRoutes.js.map