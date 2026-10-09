import type { Response } from "express";
import prisma from "../db/client.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import ApiError from "../utils/ApiError.js";
import { asyncHandlers } from "../utils/asyncHandler.js";
import type { newReq } from "../schema/types.js";

// Custom Dashboard persistence — one row per user, keyed strictly by the JWT-derived
// req.user.id (set by verifyUser after decoding + re-fetching the user from the DB). A userId
// is never accepted from the request body/query — that would let one user read or overwrite
// another user's layout just by sending a different id.

// Dashboard sections that can be moved/resized on the Standard dashboard. Must match the ids in
// megh-frontend/src/pages/Dashboard.tsx (DEFAULT_LAYOUT).
const SECTION_IDS = new Set([
  "statOrgs",
  "statDevices",
  "statStatus",
  "statAlarms",
  "networkOverview",
  "deviceHealth",
  "recentAlarms",
]);

interface SectionInput {
  id?: unknown;
  layout?: unknown;
}

const validateWidgets = (widgets: unknown): string | null => {
  if (!Array.isArray(widgets)) return "layout must be an array";
  if (widgets.length === 0) return "layout must contain at least one section";
  for (const w of widgets as SectionInput[]) {
    if (typeof w.id !== "string" || !SECTION_IDS.has(w.id))
      return `unknown dashboard section: ${String(w.id)}`;
    const layout = w.layout as { x?: unknown; y?: unknown; w?: unknown; h?: unknown } | undefined;
    if (
      !layout ||
      typeof layout.x !== "number" ||
      typeof layout.y !== "number" ||
      typeof layout.w !== "number" ||
      typeof layout.h !== "number"
    )
      return "each section needs a layout { x, y, w, h }";
  }
  return null;
};

// GET /api/v1/dashboard/layout — null widgets means "no custom dashboard yet", frontend falls
// back to the Standard Dashboard.
export const getDashboardLayout = asyncHandlers(async (req: newReq, res: Response) => {
  if (!req.user) throw new ApiError(401, "unauthorized request");

  const layout = await prisma.dashboardLayout.findUnique({ where: { userId: req.user.id } });
  return res
    .status(200)
    .json(new ApiResponse(200, { widgets: layout?.widgets ?? null }, "Dashboard layout fetched"));
});

// PUT /api/v1/dashboard/layout — upsert; body: { widgets: WidgetInstance[] }
export const saveDashboardLayout = asyncHandlers(async (req: newReq, res: Response) => {
  if (!req.user) throw new ApiError(401, "unauthorized request");

  const { widgets } = req.body as { widgets?: unknown };
  const error = validateWidgets(widgets);
  if (error) return res.status(400).json(new ApiResponse(400, {}, error));

  const layout = await prisma.dashboardLayout.upsert({
    where: { userId: req.user.id },
    update: { widgets: widgets as object },
    create: { userId: req.user.id, widgets: widgets as object },
  });

  return res.status(200).json(new ApiResponse(200, { widgets: layout.widgets }, "Dashboard layout saved"));
});

// DELETE /api/v1/dashboard/layout — reset to Standard Dashboard. No-op (still 200) if the user
// never had a custom layout.
export const resetDashboardLayout = asyncHandlers(async (req: newReq, res: Response) => {
  if (!req.user) throw new ApiError(401, "unauthorized request");

  await prisma.dashboardLayout.deleteMany({ where: { userId: req.user.id } });
  return res.status(200).json(new ApiResponse(200, {}, "Dashboard reset to standard"));
});
