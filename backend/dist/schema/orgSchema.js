import z from "zod";
export const orgSchema = z.object({
    id: z.string().cuid(),
    name: z.string().min(3, "should greater than 3"),
});
//# sourceMappingURL=orgSchema.js.map