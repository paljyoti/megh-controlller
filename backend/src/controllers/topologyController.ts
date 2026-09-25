import type { Response } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import type { newReq } from "../schema/types.js";
import { buildTopology } from "../services/topology/topologyGraph.js";
import { refreshDeviceMacTable } from "../services/topology/topologyPoller.js";
import { CommandTimeoutError } from "../services/deviceCommand.js";
import { macToColon } from "../services/topology/macTableParser.js";

// Same device-scoping rule as deviceController / alarmController: SUPERADMIN sees everything,
// ADMIN sees their org's devices, USER sees only devices assigned to them.
const deviceWhereForUser = (req: newReq): Prisma.DeviceWhereInput => {
  if (!req.user) throw new ApiError(401, "unauthorized request");
  if (req.user.role === "ADMIN") return { organizationId: req.user.orgs?.id ?? null };
  if (req.user.role === "USER") return { assignedToId: req.user.id };
  return { organizationId: { not: null } };
};

const findScopedDevice = async (req: newReq, id: string) => {
  const device = await prisma.device.findFirst({
    where: { AND: [{ OR: [{ id }, { serialNumber: id }] }, deviceWhereForUser(req)] },
  });
  if (!device) throw new ApiError(404, "Device not found");
  return device;
};

// GET /api/v1/topology
export const getTopology = asyncHandlers(async (req: newReq, res: Response) => {
  const graph = await buildTopology(deviceWhereForUser(req));
  return res.status(200).json(new ApiResponse(200, graph, "Topology fetched"));
});

// POST /api/v1/topology/refresh          — re-poll every online switch in scope now
// POST /api/v1/topology/refresh?device=… — just that one
// Sends only the read-only "show mac-address-table"; waits for the switches so the caller
// gets a fresh graph on the next GET.
export const refreshTopology = asyncHandlers(async (req: newReq, res: Response) => {
  const single = typeof req.query.device === "string" ? req.query.device : null;
  const devices = single
    ? [await findScopedDevice(req, single)]
    : await prisma.device.findMany({
        where: { AND: [deviceWhereForUser(req), { status: "online" }] },
      });

  const results: { deviceId: string; name: string; ok: boolean; rows?: number; error?: string }[] = [];
  for (const d of devices) {
    try {
      const { rows } = await refreshDeviceMacTable(d);
      results.push({ deviceId: d.id, name: d.name, ok: true, rows });
    } catch (err) {
      const error = err instanceof CommandTimeoutError ? "Device did not respond" : (err as Error).message;
      results.push({ deviceId: d.id, name: d.name, ok: false, error });
    }
  }
  return res.status(200).json(new ApiResponse(200, { results }, "Topology refresh completed"));
});

// GET /api/v1/topology/device/:id/mac-table — the raw learned-MAC list for one switch,
// grouped per port. Also what the "Mac Address Table" tab on the device page can show.
export const getDeviceMacTable = asyncHandlers(async (req: newReq, res: Response) => {
  const id = req.params.id;
  if (!id) throw new ApiError(400, "Missing route parameter: id");
  const device = await findScopedDevice(req, id);

  const entries = await prisma.macEntry.findMany({
    where: { deviceId: device.id },
    orderBy: [{ port: "asc" }, { vlanId: "asc" }, { mac: "asc" }],
  });

  const ports: Record<string, number> = {};
  for (const e of entries) ports[e.port] = (ports[e.port] ?? 0) + 1;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        device: { id: device.id, name: device.name, serialNumber: device.serialNumber },
        total: entries.length,
        ports,
        updatedAt: entries.reduce<Date | null>(
          (min, e) => (min === null || e.lastSeen < min ? e.lastSeen : min),
          null,
        ),
        entries: entries.map((e) => ({
          id: e.id,
          port: e.port,
          mac: macToColon(e.mac),
          vlanId: e.vlanId,
          type: e.type,
          learnedAt: e.learnedAt,
          firstSeen: e.firstSeen,
          lastSeen: e.lastSeen,
        })),
      },
      "MAC table fetched",
    ),
  );
});
