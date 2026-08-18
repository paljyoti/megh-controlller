import z from "zod";
import type { UserInterface } from "./userSchema.js";
import type { deptInterface } from "./departmentSchema.js";
export declare const orgSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
}, z.z.core.$strip>;
export type orgType = z.infer<typeof orgSchema>;
export interface orgInterface extends orgType {
    department?: deptInterface[] | null;
    user?: UserInterface[] | null;
    createdAt: Date;
    updateAt: Date;
}
//# sourceMappingURL=orgSchema.d.ts.map