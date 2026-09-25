import { Router } from "express";
import {
  createDhcpPool,
  deleteDhcpPool,
  listDhcpPools,
  updateDhcpPoolStatus,
  updateDhcpPoolNakStatus,
} from "../controllers/dhcpController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(verifyUser);

router.get("/", listDhcpPools);
router.post("/", requireRole("SUPERADMIN", "ADMIN"), createDhcpPool);
router.delete("/:poolId", requireRole("SUPERADMIN", "ADMIN"), deleteDhcpPool);
router.patch("/:poolId/status", requireRole("SUPERADMIN", "ADMIN"), updateDhcpPoolStatus);
router.patch("/:poolId/nak-status", requireRole("SUPERADMIN", "ADMIN"), updateDhcpPoolNakStatus);

export default router;
