import { Router } from "express";
import {
  getAllAlarms,
  getAlarmSummary,
  getDeviceAlarms,
  acknowledgeAlarm,
  resolveAlarm,
} from "../controllers/alarmController.js";
import { verifyUser } from "../middlewares/authMiddleware.js";

const router = Router();

// All routes require authentication
router.use(verifyUser);

router.get("/", getAllAlarms);
router.get("/summary", getAlarmSummary);
router.get("/device/:id", getDeviceAlarms);
router.patch("/:id/acknowledge", acknowledgeAlarm);
router.patch("/:id/resolve", resolveAlarm);

export default router;
