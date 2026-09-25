import { buildInterfaceCommand } from "../types.js";
export const l3Ac5 = {
    // CLI ref: "Configuring Routing Port IP/IPv6 Address" — SWITCH(config-if)# no switchport / switchport
    setRoutedMode: (target) => buildInterfaceCommand(target, "no switchport"),
    clearRoutedMode: (target) => buildInterfaceCommand(target, "switchport"),
    // CLI ref: "...ip address IPADDR/MASKLEN" (SVI section) / "...ip address IP(A.B.C.D/M)" (routed port section)
    setIpv4: (target, addr) => buildInterfaceCommand(target, `ip address ${addr}`),
    clearIpv4: (target, addr) => buildInterfaceCommand(target, `no ip address ${addr}`),
    // CLI ref: "...ipv6 address IP(X:X::X:X/M)"
    setIpv6: (target, addr) => buildInterfaceCommand(target, `ipv6 address ${addr}`),
    clearIpv6: (target, _addr) => buildInterfaceCommand(target, "no ipv6 address"),
};
//# sourceMappingURL=ac5.js.map