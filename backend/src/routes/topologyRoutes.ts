import { Router } from "express";
import {
  getTopology,
  refreshTopology,
  getDeviceMacTable,
} from "../controllers/topologyController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";

// Mounted at /api/v1/topology (see index.ts).
const router = Router();

router.use(verifyUser);

router.get("/", getTopology);
// Refresh sends a (read-only) command to the switches, so keep it to operators.
router.post("/refresh", requireRole("SUPERADMIN", "ADMIN"), refreshTopology);
router.get("/device/:id/mac-table", getDeviceMacTable);

export default router;
