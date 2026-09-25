import { Router } from "express";
import {
  createLinkAggregation,
  deleteLinkAggregation,
  listLinkAggregations,
  getLoadBalanceMethod,
  updateLoadBalanceMethod,
  getLacpSystemPriority,
  updateLacpSystemPriority,
} from "../controllers/linkAggregationController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(verifyUser);

router.get("/load-balance", getLoadBalanceMethod);
router.patch("/load-balance", requireRole("SUPERADMIN", "ADMIN"), updateLoadBalanceMethod);

router.get("/system-priority", getLacpSystemPriority);
router.patch("/system-priority", requireRole("SUPERADMIN", "ADMIN"), updateLacpSystemPriority);

router.get("/", listLinkAggregations);
router.post("/", requireRole("SUPERADMIN", "ADMIN"), createLinkAggregation);
router.delete("/:laId", requireRole("SUPERADMIN", "ADMIN"), deleteLinkAggregation);

export default router;
