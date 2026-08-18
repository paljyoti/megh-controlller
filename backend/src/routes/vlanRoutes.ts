import { Router } from "express";
import { createVlan, deleteVlan, listVlans, updateVlan } from "../controllers/vlanController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(verifyUser);

router.get("/", listVlans);
router.post("/", requireRole("SUPERADMIN", "ADMIN"), createVlan);
router.patch("/:vlanId", requireRole("SUPERADMIN", "ADMIN"), updateVlan);
router.delete("/:vlanId", requireRole("SUPERADMIN", "ADMIN"), deleteVlan);

export default router;
