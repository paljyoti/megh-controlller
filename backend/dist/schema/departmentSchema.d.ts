import { z } from "zod";
import type { orgInterface } from "./orgSchema.js";
import type { UserInterface } from "./userSchema.js";
export declare const departmentSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
}, z.core.$strip>;
export type Department = z.infer<typeof departmentSchema>;
export interface deptInterface extends Department {
    orgs?: orgInterface | null;
    users?: UserInterface[] | null;
    createdAt: Date;
    updateAt: Date;
}
//# sourceMappingURL=departmentSchema.d.ts.map