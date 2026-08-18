import type { Department } from "@prisma/client";
import z from "zod";
import type { UserInterface } from "./userSchema.js";
import type { deptInterface } from "./departmentSchema.js";

export const orgSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(3, "should greater than 3"),
});

export type orgType = z.infer<typeof orgSchema>;

export interface orgInterface extends orgType {
  department?: deptInterface[] | null;
  user?: UserInterface[] | null;
  createdAt: Date;
  updateAt: Date;
}
