import { Router } from "express";
import { listPorts, updatePort } from "../controllers/portController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(verifyUser);

router.get("/", listPorts);
router.patch("/", requireRole("SUPERADMIN", "ADMIN"), updatePort);

export default router;
