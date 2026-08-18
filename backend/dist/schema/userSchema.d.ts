import { z } from "zod";
import type { orgInterface } from "./orgSchema.js";
import type { deptInterface } from "./departmentSchema.js";
export declare const userSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<{
        SUPERADMIN: "SUPERADMIN";
        ADMIN: "ADMIN";
        USER: "USER";
    }>;
}, z.core.$strip>;
export type User = z.infer<typeof userSchema>;
export interface UserInterface extends User {
    orgs?: orgInterface | null;
    dept?: deptInterface | null;
    updateAt: Date;
    createdAt: Date;
}
//# sourceMappingURL=userSchema.d.ts.map