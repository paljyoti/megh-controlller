import prisma from "../db/client.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import type { Response } from "express";
import { asyncHandlers } from "../utils/asyncHandler.js";
import type { newReq } from "../schema/types.js";

export const createOrg = asyncHandlers(async (req: newReq, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new ApiError(401, "unauthorized request");
  }
  if (user.role !== "SUPERADMIN") {
    throw new ApiError(500, "only super admin can create organization");
  }
  const { name } = req.body;

  if (!name) {
    throw new ApiError(404, "name is required to created orgs");
  }

  const existingOrg = await prisma.organization.findFirst({
    where: {
      name: name,
    },
  });

  if (existingOrg) {
    throw new ApiError(500, "organization with this name is already present");
  }

  const orgs = await prisma.organization.create({
    data: {
      name: name,
    } ,
  });

  if (!orgs) {
    throw new ApiError(500, "error in creating orgs with give name");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { orgs }, "organization is successfully created")
    );   
});

export const getAllDepts = asyncHandlers(async (req: newReq, res: Response) => {
  const user = req.user;
  if (!user || !user.orgs || !user.orgs.id) {
    throw new ApiError(401, "authorized entry");
  }

  const AllDept = await prisma.organization.findFirst({
    where: {
      id: user.orgs?.id,
    },
    include: {  
      departments: {
        include: { users: true },
      },              
    },
  }); 

  if (!AllDept) {
    throw new ApiError(500, "unable to fetch all department");
  }  

  return res
    .status(200)
    .json(new ApiResponse(200, { AllDept }, "successfully fetched all departments"));
});

export const getAllOrgs = asyncHandlers(async (req: newReq, res: Response) => {
  if (req.user?.role !== "SUPERADMIN")
    throw new ApiError(403, "Only SUPERADMIN can list all organizations");

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { devices: true, users: true } },
    },
    orderBy: { name: "asc" },
  });
  return res.status(200).json(new ApiResponse(200, { orgs }, "Organizations fetched"));
});

export const getOrgUsers = asyncHandlers(async (req: newReq, res: Response) => {
  if (!req.user) throw new ApiError(401, "unauthorized request");

  const orgId = req.params.orgId || req.user.orgs?.id;
  if (!orgId) throw new ApiError(400, "Organization ID required");

  if (req.user.role === "ADMIN" && req.user.orgs?.id !== orgId)
    throw new ApiError(403, "Cannot view users of another organization");

  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, email: true, role: true },
  });
  return res.status(200).json(new ApiResponse(200, { users }, "Users fetched"));
});

export const getOrgDetails = asyncHandlers(async (req: newReq, res: Response) => {
  if (!req.user) throw new ApiError(401, "unauthorized request");

  const orgId = req.params.orgId;
  if (!orgId) throw new ApiError(400, "Organization ID required");

  if (req.user.role === "ADMIN" && req.user.orgs?.id !== orgId)
    throw new ApiError(403, "Cannot view another organization");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      devices: {
        include: { assignedTo: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      users: { select: { id: true, name: true, email: true, role: true } },
      _count: { select: { devices: true, users: true } },
    },
  });

  if (!org) throw new ApiError(404, "Organization not found");

  return res.status(200).json(new ApiResponse(200, { org }, "Organization details fetched"));
});

