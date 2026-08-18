import { Router } from "express";
import { createOrg, getAllDepts, getAllOrgs, getOrgUsers, getOrgDetails, } from "../controllers/organisationController.js";
import { verifyUser } from "../middlewares/authMiddleware.js";
const router = Router();
router.get("/all", verifyUser, getAllOrgs);
router.route("/create-orgs").post(verifyUser, createOrg);
router.route("/getAllDepartment").get(verifyUser, getAllDepts);
router.get("/:orgId/details", verifyUser, getOrgDetails);
router.get("/:orgId/users", verifyUser, getOrgUsers);
export default router;
//# sourceMappingURL=orgsRoutes.js.map