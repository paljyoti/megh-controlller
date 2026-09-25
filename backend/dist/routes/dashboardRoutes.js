import { Router } from "express";
import { getAllSwitches } from "../controllers/dashboardController.js";
import { getNetworkOverview } from "../controllers/networkOverviewController.js";
import { verifyUser } from "../middlewares/authMiddleware.js";
const router = Router();
router.route("/get-all-switch-list").get(getAllSwitches);
// Real telemetry-derived traffic for the Dashboard's Network Overview chart — see
// networkOverviewController.ts. verifyUser is applied only to this route (not router-wide) so
// the existing get-all-switch-list route's behavior is unchanged.
router.get("/network-overview", verifyUser, getNetworkOverview);
export default router;
//# sourceMappingURL=dashboardRoutes.js.map