import type { Request } from "express";
import type { UserInterface } from "./userSchema.js";
interface newReq extends Request {
    user?: UserInterface;
}
export type { newReq };
//# sourceMappingURL=types.d.ts.map