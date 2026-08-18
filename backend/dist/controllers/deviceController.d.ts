import type { Response } from "express";
export declare const getAllDevices: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const getTelemetry: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const getEvents: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const getStatus: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const getStatusHistory: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const sendCommand: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const broadcastCommand: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const fileTransfer: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const getCommandStatus: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const getUnassignedDevices: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const assignDevice: (req: any, res: Response, next: import("express").NextFunction) => void;
export declare const unassignDevice: (req: any, res: Response, next: import("express").NextFunction) => void;
//# sourceMappingURL=deviceController.d.ts.map