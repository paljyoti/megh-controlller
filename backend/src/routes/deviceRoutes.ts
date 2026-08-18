import { Router } from "express";
import {
  getTelemetry,
  getEvents,
  getStatus,
  getStatusHistory,
  sendCommand,
  broadcastCommand,
  fileTransfer,
  getCommandStatus,
  getAllDevices,
  getUnassignedDevices,
  assignDevice,
  unassignDevice,
} from "../controllers/deviceController.js";
import { verifyUser, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

// All routes require authentication
router.use(verifyUser);

// Device list
router.get("/", getAllDevices);

// Onboard, assign & unassign (before /:id routes)
router.get("/onboard", getUnassignedDevices);
router.post("/assign", assignDevice);
router.post("/unassign", unassignDevice);

// Broadcast (ADMIN+ only)
router.post("/broadcast", requireRole("SUPERADMIN", "ADMIN"), broadcastCommand);

// Per-device routes
router.get("/:id/telemetry", getTelemetry);
router.get("/:id/events", getEvents);
router.get("/:id/status", getStatus);
router.get("/:id/status-history", getStatusHistory);
router.post("/:id/command", requireRole("SUPERADMIN", "ADMIN"), sendCommand);
router.post("/:id/file-transfer", requireRole("SUPERADMIN", "ADMIN"), fileTransfer);
router.get("/:id/command/:requestId", getCommandStatus);

export default router;



