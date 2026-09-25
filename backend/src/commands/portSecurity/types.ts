import type { CommandSpec, InterfaceTarget } from "../types.js";

export interface PortSecurityCommandBuilder {
  // MAC address format is model-specific (e.g. AC5's colon-separated "00:11:22:33:44:55" vs.
  // TR's dot-grouped "0011.2233.4455") — validation lives here, not in the controller.
  validateMac: (macAddress: string) => boolean;
  // Shown in the controller's rejection message when validateMac fails.
  macFormatHint: string;

  // ─── "switchport port-security" (TR models only — confirmed live) ─────────────────
  setPortSecurityEnabled?: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
  // "switchport port-security aging static" / "no ...".
  setPortSecurityAgingStatic?: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
  // "switchport port-security aging time VALUE" (0-1440 minutes) / "no ... aging time".
  setPortSecurityAgingTime?: (target: InterfaceTarget, minutes: number | null) => CommandSpec;
  // "switchport port-security mac-address sticky" / "no ...".
  setPortSecurityStickyMac?: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
  // "switchport port-security maximum VALUE" (1-1024) / "no ... maximum".
  setPortSecurityMaximum?: (target: InterfaceTarget, max: number | null) => CommandSpec;
  // "switchport port-security violation {restrict|shutdown}" / "no ... violation".
  setPortSecurityViolation?: (target: InterfaceTarget, mode: "restrict" | "shutdown" | null) => CommandSpec;

  // Individually-configured secure MAC entries — confirmed live, no trailing arguments:
  // "switchport port-security mac-address XXXX.XXXX.XXXX", or with sticky=true,
  // "switchport port-security mac-address sticky XXXX.XXXX.XXXX" (pre-seeds a specific MAC as
  // sticky-secured instead of the port learning it dynamically). Uses the same MAC format —
  // validate with validateMac/macFormatHint above.
  bindStaticMac?: (target: InterfaceTarget, macAddress: string, sticky: boolean) => CommandSpec;
  // "no switchport port-security mac-address XXXX.XXXX.XXXX" — confirmed live, this one form
  // removes either a plain static or a sticky-seeded entry.
  unbindStaticMac?: (target: InterfaceTarget, macAddress: string) => CommandSpec;
}
