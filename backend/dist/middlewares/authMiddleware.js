import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import prisma from "../db/client.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
export const verifyUser = asyncHandlers(async (req, res, next) => {
    const token = req.cookies?.accessToken ||
        req.header("Authorization")?.replace("Bearer ", "");
    console.log(token);
    if (!token) {
        throw new ApiError(401, "unauthorized request");
    }
    const decoded_token = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (!decoded_token ||
        typeof decoded_token !== "object" ||
        !("id" in decoded_token)) {
        throw new ApiError(402, "couldn't decode the token");
    }
    const user = await prisma.user.findFirst({
        where: {
            id: decoded_token.id,
        },
        select: {
            id: true,
            name: true,
            email: true,
            orgs: true,
            dept: true,
            role: true,
            createdAt: true,
            updateAt: true,
        },
    });
    if (!user) {
        throw new ApiError(404, "user not found of authorization token");
    }
    req.user = user;
    next();
});
export const requireRole = (...roles) => asyncHandlers(async (req, res, next) => {
    if (!req.user)
        throw new ApiError(401, "unauthorized request");
    if (!roles.includes(req.user.role))
        throw new ApiError(403, "Forbidden: insufficient role");
    next();
});
//# sourceMappingURL=authMiddleware.js.map