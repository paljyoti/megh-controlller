import { z } from "zod";
import type { orgInterface } from "./orgSchema.js";
import type { deptInterface } from "./departmentSchema.js";

export const userSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[@$!%*?&]/, "Password must contain at least one special character")
    .optional(),
  role: z.enum(["ADMIN", "SUPERADMIN", "USER"]),
});

export type User = z.infer<typeof userSchema>;

export interface UserInterface extends User {
  orgs?: orgInterface | null;
  dept?: deptInterface | null;
  updateAt: Date;
  createdAt: Date;
}
