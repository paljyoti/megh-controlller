import { z } from "zod";
import type { orgInterface } from "./orgSchema.js";
import type { UserInterface } from "./userSchema.js";

export const departmentSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(3, "should atleast 3 character"),
});

export type Department = z.infer<typeof departmentSchema>;

export interface deptInterface extends Department {
  orgs?: orgInterface | null;
  users?: UserInterface[] | null;
  createdAt: Date;
  updateAt: Date;
}
