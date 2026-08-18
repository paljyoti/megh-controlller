import type { Response } from "express";
import type { newReq } from "../schema/types.js";
export declare const login: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const register: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const logout: (req: newReq, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAllUser: (req: any, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=UserController.d.ts.map