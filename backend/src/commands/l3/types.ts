import type { CommandSpec, InterfaceTarget } from "../types.js";

// Layer 3 addressing. `target` is an InterfaceTarget with kind "svi" (VLAN interface) or
// "single" (a physical port already switched into routed mode via setRoutedMode).
// CLI ref: "Configuring SVI Port IP/IPv6 Address" and "Configuring Routing Port IP/IPv6
// Address" — same ip/ipv6 address subcommands apply to both once inside the right context.
export interface L3CommandBuilder {
  // CLI ref: "no switchport" — required before a physical port accepts an ip address command.
  setRoutedMode: (target: InterfaceTarget) => CommandSpec;
  clearRoutedMode: (target: InterfaceTarget) => CommandSpec;
  setIpv4: (target: InterfaceTarget, addr: string) => CommandSpec;
  clearIpv4: (target: InterfaceTarget, addr: string) => CommandSpec;
  setIpv6: (target: InterfaceTarget, addr: string) => CommandSpec;
  // Confirmed live: unlike clearIpv4, "no ipv6 address <addr>" is rejected as a syntax error
  // ("Invalid input detected") — the switch wants "no ipv6 address" with no argument, which
  // clears whatever is set. `addr` is accepted for symmetry with clearIpv4 but ignored.
  clearIpv6: (target: InterfaceTarget, addr: string) => CommandSpec;
}
