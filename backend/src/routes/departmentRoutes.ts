import { Router } from "express";
import { verifyUser } from "../middlewares/authMiddleware.js";
import { createDept } from "../controllers/departmentController.js";

const router = Router();

router.route("/create-dept").post(verifyUser, createDept);

export default router;
