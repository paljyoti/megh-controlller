import type { Response, NextFunction } from "express";
declare const asyncHandlers: (reqHandler: (req: any, res: Response, next: NextFunction) => void) => (req: any, res: Response, next: NextFunction) => void;
export { asyncHandlers };
//# sourceMappingURL=asyncHandler.d.ts.map