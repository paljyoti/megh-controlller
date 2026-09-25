import { buildRouteCommand } from "./ac5.js";
export const routeTr = {
    // Identical to AC5 (confirmed by doc comparison): "ip route {dest/mask|dest mask} {next-hop|interface}".
    create: (params) => ({ command: buildRouteCommand(params), mode: "config" }),
    // TR's own CLI ref is explicit that the next-hop/interface argument is NOT optional in the
    // "no" form: "no ip route {IPADDR/MASKLEN | IPADDR MASK} {NH_IPADDR | IFNAME}" — confirmed
    // live: prefix+mask alone gets "% Incomplete command." on this switch (unlike AC5, which
    // rejects the *full* line if next-hop/distance has drifted — see route/ac5.ts). So TR
    // reconstructs the full line from whatever we last stored for this route.
    delete: (params) => ({ command: `no ${buildRouteCommand(params)}`, mode: "config" }),
};
//# sourceMappingURL=tr.js.map