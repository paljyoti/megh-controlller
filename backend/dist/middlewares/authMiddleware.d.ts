import type { Response, NextFunction } from "express";
export declare const verifyUser: (req: any, res: Response, next: NextFunction) => void;
export declare const requireRole: (...roles: string[]) => (req: any, res: Response, next: NextFunction) => void;
//# sourceMappingURL=authMiddleware.d.ts.map