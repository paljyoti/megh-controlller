import { Router } from "express";
import { login, register, logout, getAllUser } from "../controllers/UserController.js";
import { verifyUser } from "../middlewares/authMiddleware.js";
const router = Router();
router.route("/login").post(login);
router.route("/register").post(register);
router.route("/logout").post(verifyUser, logout);
// router.get("/all", getAllUser);
router.get("/all", verifyUser, getAllUser);
export default router;
//# sourceMappingURL=userRoutes.js.map