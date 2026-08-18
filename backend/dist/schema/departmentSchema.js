import { z } from "zod";
export const departmentSchema = z.object({
    id: z.string().cuid(),
    name: z.string().min(3, "should atleast 3 character"),
});
//# sourceMappingURL=departmentSchema.js.map