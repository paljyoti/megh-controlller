import { mockSwitches } from "../seed/data.js";
import type { Request, Response } from "express";
export const getAllSwitches = (req: Request, res: Response) => {
  let switches: any = [];
  mockSwitches.forEach((item) =>
    switches.push({
      id: item.id,
      name: item.name,
      model: item.model,
      status: item.status,
      ipAddress: item.ipAddress,
      firmwareVersion: item.firmwareVersion,
      description: item.description,
      uptime: item.uptime,
      lastCheckin: item.lastCheckin,
      upload: item.traffic.upload,
      download: item.traffic.download,
    })
  );
  res.status(200).json({
    noOfSwitches: mockSwitches.length,
    switches: switches,
  });
};
