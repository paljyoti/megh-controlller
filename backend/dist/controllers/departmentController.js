import ApiError from "../utils/ApiError.js";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
export const createDept = async (req, res) => {
    const user = req.user;
    console.log(user);
    if (!user || (user?.role !== "ADMIN" && user?.role !== "SUPERADMIN")) {
        throw new ApiError(401, "access denied to create dept");
    }
    if (!user.orgs) {
        throw new ApiError(401, "no organization found");
    }
    const { name } = req.body;
    if (!name) {
        throw new ApiError(404, "name is required field for creating dept");
    }
    const existingDept = await prisma.department.findFirst({
        where: {
            name: name,
            organizationId: user.orgs?.id,
        },
    });
    if (existingDept) {
        throw new ApiError(402, "department(user) already exits");
    }
    const dept = await prisma.department.create({
        data: {
            name: name,
            organizationId: user.orgs.id,
        },
    });
    if (!dept) {
        throw new ApiError(401, "failed to created dept");
    }
    return res
        .status(200)
        .json(new ApiResponse(200, { dept }, "successfully created"));
};
//# sourceMappingURL=departmentController.js.map