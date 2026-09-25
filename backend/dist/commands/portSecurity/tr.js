import { buildInterfaceCommand } from "../types.js";
// CLI ref: TR's MAC format is dot-grouped (XXXX.XXXX.XXXX), confirmed live against a real
// TR-MS2910-P terminal for "switchport port-security mac-address".
const MAC_RE = /^[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}$/;
export const portSecurityTr = {
    validateMac: (macAddress) => MAC_RE.test(macAddress),
    macFormatHint: "0011.2233.4455",
    setPortSecurityEnabled: (target, enabled) => buildInterfaceCommand(target, enabled ? "switchport port-security" : "no switchport port-security"),
    setPortSecurityAgingStatic: (target, enabled) => buildInterfaceCommand(target, enabled ? "switchport port-security aging static" : "no switchport port-security aging static"),
    setPortSecurityAgingTime: (target, minutes) => minutes === null
        ? buildInterfaceCommand(target, "no switchport port-security aging time")
        : buildInterfaceCommand(target, `switchport port-security aging time ${minutes}`),
    setPortSecurityStickyMac: (target, enabled) => buildInterfaceCommand(target, enabled ? "switchport port-security mac-address sticky" : "no switchport port-security mac-address sticky"),
    setPortSecurityMaximum: (target, max) => max === null
        ? buildInterfaceCommand(target, "no switchport port-security maximum")
        : buildInterfaceCommand(target, `switchport port-security maximum ${max}`),
    setPortSecurityViolation: (target, mode) => mode === null
        ? buildInterfaceCommand(target, "no switchport port-security violation")
        : buildInterfaceCommand(target, `switchport port-security violation ${mode}`),
    bindStaticMac: (target, macAddress, sticky) => buildInterfaceCommand(target, sticky
        ? `switchport port-security mac-address sticky ${macAddress}`
        : `switchport port-security mac-address ${macAddress}`),
    unbindStaticMac: (target, macAddress) => buildInterfaceCommand(target, `no switchport port-security mac-address ${macAddress}`),
};
//# sourceMappingURL=tr.js.map