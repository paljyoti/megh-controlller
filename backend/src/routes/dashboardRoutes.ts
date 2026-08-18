import { Router } from "express";
import { getAllSwitches } from "../controllers/dashboardController.js";
const router = Router();

router.route("/get-all-switch-list").get(getAllSwitches);

export default router;
