// Exported so route/tr.ts can reuse it — "ip route ..." creation syntax is identical between
// AC5 and TR (confirmed by doc comparison); only the delete form differs (see tr.ts).
export const buildRouteCommand = ({ destIpSegment, destIpMask, interfaceType, forwardingRoutingAddress, distanceMetric, }) => {
    const nextHop = interfaceType === "null0 interface" ? "null0" : (forwardingRoutingAddress || "").trim();
    const parts = ["ip route", destIpSegment, destIpMask, nextHop];
    if (distanceMetric)
        parts.push(String(distanceMetric));
    return parts.join(" ");
};
export const routeAc5 = {
    create: (params) => ({ command: buildRouteCommand(params), mode: "config" }),
    // Deletes by prefix + mask only (our uniqueness key for a route) rather than
    // reconstructing the full "ip route <dest> <mask> <next-hop> [distance]" line —
    // the switch rejects a full-line "no" with "% No matching route to delete" if the
    // next-hop/distance stored in our DB has drifted at all from what's actually live
    // on the device, even though the prefix+mask still uniquely identifies the route.
    delete: (params) => ({
        command: `no ip route ${params.destIpSegment} ${params.destIpMask}`,
        mode: "config",
    }),
};
//# sourceMappingURL=ac5.js.map