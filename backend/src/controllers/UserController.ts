import type { Response, Request } from "express";
import client from "../db/client.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import bcrypt from "bcrypt";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { User, UserInterface } from "../schema/userSchema.js";

import type { newReq } from "../schema/types.js";
const options = {
  httpOnly: true,
  secure: true,
};

const generateAccessToken = async (user: UserInterface) => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      depts: user.dept,
      orgs: user.orgs,
      role: user.role,
    } as JwtPayload,
    process.env.ACCESS_TOKEN_SECRET as string,
    {
      expiresIn: "48h",
    }
  );
};

const generateRefreshToken = async (user: UserInterface) => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      dept: user.dept,
      orgs: user.orgs,
    } as JwtPayload,
    process.env.REFRESH_TOKEN_SECRET as string,
    {
      expiresIn: "48h",
    }
  );
};
export const login = asyncHandlers(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, "email and password is required");
  }

  const existingUser = await client.user.findFirst({
    where: {
      email: email,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      password: true,
      orgs: true, // Ensure orgs is selected
      dept: true, // Ensure dept is selected
      updateAt: true,
      createdAt: true,
    },
  });

  if (!existingUser) {
    throw new ApiError(404, "user doesn't exits!!");
  }

  const correctPassword = await bcrypt.compare(password, existingUser.password);

  if (!correctPassword) {
    throw new ApiError(501, "password is wrong");
  }

  const accessToken = await generateAccessToken(existingUser);
  const refreshToken = await generateRefreshToken(existingUser);

  if (!accessToken || !refreshToken) {
    throw new ApiError(502, "couldn't generate tokens");
  }

  const updatedUser = await client.user.update({
    where: {
      id: existingUser.id,
    },
    data: {
      refreshToken: refreshToken,
    },
    select: {
      name: true,
      dept: true,
      orgs: true,
      email: true,
      role: true,
      refreshToken: true,
    },
  });

  return res
    .status(200)
    .cookie("accessToken", accessToken)
    .cookie("refreshToken", refreshToken)
    .json(new ApiResponse(200, { updatedUser }, "login successful"));
});

export const register = asyncHandlers(async (req: newReq, res: Response) => {
  const { name, email, password, deptId, orgsId, role } = req.body;
  if (!email || !password || !name) {
    throw new ApiError(400, "email, password and organisation is required");
  }
  if (!role || role == "USER") {
    if (!deptId && !orgsId) {
      throw new ApiError(401, "orgs and dept required for user");
    }
  }
  if (role == "ADMIN" && !orgsId) {
    throw new ApiError(401, "orgs is required for admin");
  }
  if (role === "SUPERADMIN" && req.user?.role !== "SUPERADMIN") {
    throw new ApiError(403, "only a super admin can create another super admin");
  }

  const existingUser = await client.user.findFirst({
    where: {
      email: email,
    },
  });

  if (existingUser) {
    throw new ApiError(500, "user already exits!!");
  }
  const hashPassword = await bcrypt.hash(password, 10);
  const newUser = await client.user.create({
    data: {
      name: name,
      email: email,
      password: hashPassword,
      role: role,
      departmentId: deptId,
      organizationId: orgsId,
      refreshToken: "",
    },
    select: {
      name: true,
      email: true,
      role: true,
      dept: true,
      orgs: true,
    },
  });
  if (!newUser) {
    throw new ApiError(500, "error in user creation");
  }     

  return res
    .status(200)
    .json(new ApiResponse(200, { newUser }, "user successfully created!!"));
});

export const logout = async (req: newReq, res: Response) => {
  if (!req.user) {
    throw new ApiError(404, "user is not verified");
  }
  const id = req.user.id;

  await client.user.update({
    where: {
      id: id,
    },
    data: {
      refreshToken: "",
    },
  });

  return res.status(200).json(new ApiResponse(200, {}, "successfully logout"));
};
                
export const getAllUser = asyncHandlers(async (req: newReq, res: Response) => {
  if (!req.user) throw new ApiError(401, "unauthorized request");

  let where = {};
  if (req.user.role === "ADMIN") {
    where = { organizationId: req.user.orgs?.id };
  } else if (req.user.role === "USER") {
    throw new ApiError(403, "Users cannot view user list");
  }

  const users = await client.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      orgs: { select: { id: true, name: true } },
      dept: { select: { id: true, name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return res.status(200).json(new ApiResponse(200, { users }, "Users fetched"));
});
