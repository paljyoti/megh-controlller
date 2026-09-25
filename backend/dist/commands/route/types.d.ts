import type { CommandSpec } from "../types.js";
export interface RouteCommandParams {
    destIpSegment: string;
    destIpMask: string;
    interfaceType: string;
    forwardingRoutingAddress?: string | null;
    distanceMetric?: number | null;
}
export interface RouteCommandBuilder {
    create: (params: RouteCommandParams) => CommandSpec;
    delete: (params: RouteCommandParams) => CommandSpec;
}
//# sourceMappingURL=types.d.ts.map