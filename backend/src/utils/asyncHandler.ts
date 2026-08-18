import type { Response, NextFunction } from "express";
const asyncHandlers = (
  reqHandler: (req: any, res: Response, next: NextFunction) => void
) => {
  return (req: any, res: Response, next: NextFunction) => {
    Promise.resolve(reqHandler(req, res, next)).catch((error) => next(error));
  };
};

export { asyncHandlers };
  