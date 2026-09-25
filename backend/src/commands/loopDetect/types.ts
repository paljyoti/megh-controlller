import type { CommandSpec, InterfaceTarget } from "../types.js";

// LOOP-DETECT — TR models only, no equivalent found in AC5's CLI reference. Global enable
// gates whether port-level enable actually does anything (CLI: "When the global enable control
// is enabled and the loop detection is enabled on the port, the port supports the loop
// detection function").
export interface LoopDetectCommandBuilder {
  // CLI ref: "Enable LOOP-DETECT Globally" — SWITCH(config)#loop-detect enable / no loop-detect enable
  setGlobalEnabled: (enabled: boolean) => CommandSpec;
  // CLI ref: "Enable LOOP-DETECT On Interface" — SWITCH(config-if)#loop-detect enable / no loop-detect enable
  setPortEnabled: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
  // CLI ref: "Configure Port Loop Action" — SWITCH(config-if)#loop-detect action (alarm | error-down)
  setPortAction: (target: InterfaceTarget, action: "alarm" | "error-down") => CommandSpec;
  // CLI ref: "Specify Vlan Domain To Detect" — SWITCH(config-if)#loop-detect vlan VID / no loop-detect vlan
  // vlanSpec supports single/range, comma-separated, up to 8 VLANs; null clears (detect ignoring VLAN).
  setPortVlans: (target: InterfaceTarget, vlanSpec: string | null) => CommandSpec;
  // CLI ref: "Set Packet Sending Interval" — SWITCH(config)#loop-detect interval SECONDS (5-300)
  setInterval: (seconds: number) => CommandSpec;
  // CLI ref: "Set Error-down Recovery Time" — SWITCH(config)#errdisable timeout (interval SECONDS | enable | disable)
  // Shared across all errdisable-triggering features on the device, not loop-detect specific.
  setErrdisableTimeoutEnabled: (enabled: boolean) => CommandSpec;
  setErrdisableTimeoutInterval: (seconds: number) => CommandSpec;
  // CLI ref: "Error-down Recovery" — SWITCH#errdisable recovery interface IFNAME (exec mode,
  // flat command with the port name as a literal argument — not an interface-context command).
  recoverErrdisablePort: (port: string) => CommandSpec;
  // CLI ref: "Enable Trap" — SWITCH(config)#loop-detect trap enable / no loop-detect trap enable
  setTrapEnabled: (enabled: boolean) => CommandSpec;
}
