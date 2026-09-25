import type { CommandSpec, InterfaceTarget } from "../types.js";

// Per-interface config. Every one of these needs "interface X" (or "interface range X")
// entered first via the Pre-command context stack built by buildInterfaceCommand — see
// portController.ts for how it's invoked and persisted.
export interface PortCommandBuilder {
  setDescription: (target: InterfaceTarget, description: string) => CommandSpec;
  setAdminStatus: (target: InterfaceTarget, status: "up" | "down") => CommandSpec;
  setSpeed: (target: InterfaceTarget, speed: string) => CommandSpec;
  setDuplex: (target: InterfaceTarget, duplex: string) => CommandSpec;
  setFlowControl: (target: InterfaceTarget, flowControl: "on" | "off") => CommandSpec;
  setMtu: (target: InterfaceTarget, mtu: number) => CommandSpec;
  setMedium: (target: InterfaceTarget, medium: "copper" | "fiber") => CommandSpec;
  setSfpMode: (target: InterfaceTarget, sfpMode: string) => CommandSpec;
  setAutoneg: (target: InterfaceTarget, autoneg: "on" | "off") => CommandSpec;
  // CLI ref: "Configuring VLAN" section — switchport mode / access / trunk / hybrid commands.
  setSwitchportMode: (target: InterfaceTarget, mode: "access" | "trunk" | "hybrid") => CommandSpec;
  setAccessVlan: (target: InterfaceTarget, vlanId: number) => CommandSpec;
  // vlanList is "all" | "none" | a VLAN_LIST string (e.g. "2,5-10")
  setTrunkAllowedVlan: (target: InterfaceTarget, vlanList: string) => CommandSpec;
  setTrunkNativeVlan: (target: InterfaceTarget, vlanId: number) => CommandSpec;
  setHybridAllowedVlan: (target: InterfaceTarget, vlanList: string) => CommandSpec;
  setHybridVlan: (target: InterfaceTarget, vlanId: number) => CommandSpec;
  setHybridUntaggedVlan: (target: InterfaceTarget, vlanList: string) => CommandSpec;
  // CLI ref: "no switchport hybrid untagged vlan VLAN_LIST" — removes the given VLANs from
  // the untagged list. Used to clear it, since (confirmed live) the positive command does
  // NOT accept "none" — "switchport hybrid untagged vlan none" is rejected as
  // "% VLAN ID or Range in-correct.", unlike the allowed-vlan commands which do accept "none".
  clearHybridUntaggedVlan: (target: InterfaceTarget, vlanList: string) => CommandSpec;
  // CLI ref: "Configuring LACP Interface Priority" — SWITCH(config-if)# lacp port-priority PORT-PRIORITY
  setLacpPortPriority: (target: InterfaceTarget, priority: number) => CommandSpec;
  // CLI ref: "Configuring LACP Timeout Mode" — SWITCH(config-if)# lacp timeout {long | short}
  setLacpTimeout: (target: InterfaceTarget, timeout: "long" | "short") => CommandSpec;
}
