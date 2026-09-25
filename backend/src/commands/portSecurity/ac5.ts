import type { PortSecurityCommandBuilder } from "./types.js";

const MAC_RE = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;

// AC5 has no "switchport port-security" CLI at all — only validateMac/macFormatHint are used
// (by nothing currently, since AC5 doesn't implement bindStaticMac either), kept so the shape
// stays consistent if AC5 gains a comparable feature later.
export const portSecurityAc5: PortSecurityCommandBuilder = {
  validateMac: (macAddress) => MAC_RE.test(macAddress),
  macFormatHint: "00:11:22:33:44:55",
};
