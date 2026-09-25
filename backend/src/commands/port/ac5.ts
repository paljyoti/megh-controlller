import { buildInterfaceCommand } from "../types.js";
import type { PortCommandBuilder } from "./types.js";

export const portAc5: PortCommandBuilder = {
  // CLI ref: "Adding a Description for an Interface" — SWITCH(config-if)# description DESC /
  // SWITCH(config-if)# no description. Confirmed live: "description " with an empty value
  // is rejected ("% Incomplete command.") — clearing requires "no description" instead.
  setDescription: (target, description) =>
    description.trim()
      ? buildInterfaceCommand(target, `description ${description}`)
      : buildInterfaceCommand(target, "no description"),
  // CLI ref: "Shutdown the Interface" — SWITCH(config-if)# shutdown / no shutdown
  setAdminStatus: (target, status) =>
    buildInterfaceCommand(target, status === "up" ? "no shutdown" : "shutdown"),
  // CLI ref: "Configuring Interface Speed" — SWITCH(config-if)# speed {10 | 100 | 1000 | auto}
  setSpeed: (target, speed) => buildInterfaceCommand(target, `speed ${speed}`),
  // CLI ref: "Configuring Interface Duplex Mode" — SWITCH(config-if)# duplex {auto | full | half}
  setDuplex: (target, duplex) => buildInterfaceCommand(target, `duplex ${duplex}`),
  // CLI ref: "Configuring Interface Flowcontrol" — SWITCH(config-if)# flowcontrol {on | off}
  setFlowControl: (target, flowControl) => buildInterfaceCommand(target, `flowcontrol ${flowControl}`),
  // CLI ref: "Configuring Interface MTU" — SWITCH(config-if)# mtu LENGTH (46-10222, default 1500)
  setMtu: (target, mtu) => buildInterfaceCommand(target, `mtu ${mtu}`),
  // CLI ref: "Configuring Interface Medium Type" — SWITCH(config-if)# medium (copper | fiber)
  setMedium: (target, medium) => buildInterfaceCommand(target, `medium ${medium}`),
  // CLI ref: "Configuring SFP Interface Mode" — SWITCH(config-if)# port mode {sgmii | 2500BASE-X | 1000BASE-X | 10G}
  setSfpMode: (target, sfpMode) => buildInterfaceCommand(target, `port mode ${sfpMode}`),
  // CLI ref: "Configuring Interface Auto negotiation" — SWITCH(config-if)# autoneg on / no autoneg
  setAutoneg: (target, autoneg) => buildInterfaceCommand(target, autoneg === "on" ? "autoneg on" : "no autoneg"),
  // CLI ref: "Configuring the Interface as a Access/Trunk/Hybrid Port" — SWITCH(config-if)# switchport mode {access|trunk|hybrid}
  setSwitchportMode: (target, mode) => buildInterfaceCommand(target, `switchport mode ${mode}`),
  // CLI ref: "Configuring the Interface as a Access Port" — SWITCH(config-if)# switchport access vlan VLANID
  setAccessVlan: (target, vlanId) => buildInterfaceCommand(target, `switchport access vlan ${vlanId}`),
  // CLI ref: "Configuring the Interface as a Trunk Port" — SWITCH(config-if)# switchport trunk allowed vlan {all|VLAN_LIST|none}
  setTrunkAllowedVlan: (target, vlanList) => buildInterfaceCommand(target, `switchport trunk allowed vlan ${vlanList}`),
  // CLI ref: "Configuring the Interface as a Trunk Port" — SWITCH(config-if)# switchport trunk native vlan VLANID
  setTrunkNativeVlan: (target, vlanId) => buildInterfaceCommand(target, `switchport trunk native vlan ${vlanId}`),
  // CLI ref: "Configure the Interface as a Hybrid Port" — SWITCH(config-if)# switchport hybrid allowed vlan {all|VLAN_LIST|none}
  setHybridAllowedVlan: (target, vlanList) => buildInterfaceCommand(target, `switchport hybrid allowed vlan ${vlanList}`),
  // CLI ref: "Configure the Interface as a Hybrid Port" — SWITCH(config-if)# switchport hybrid vlan VLANID (PVID)
  setHybridVlan: (target, vlanId) => buildInterfaceCommand(target, `switchport hybrid vlan ${vlanId}`),
  // CLI ref: "Configure the Interface as a Hybrid Port" — SWITCH(config-if)# switchport hybrid untagged vlan VLAN_LIST
  setHybridUntaggedVlan: (target, vlanList) => buildInterfaceCommand(target, `switchport hybrid untagged vlan ${vlanList}`),
  clearHybridUntaggedVlan: (target, vlanList) => buildInterfaceCommand(target, `no switchport hybrid untagged vlan ${vlanList}`),
  // CLI ref: "Configuring LACP Interface Priority" — SWITCH(config-if)# lacp port-priority PORT-PRIORITY
  setLacpPortPriority: (target, priority) => buildInterfaceCommand(target, `lacp port-priority ${priority}`),
  // CLI ref: "Configuring LACP Timeout Mode" — SWITCH(config-if)# lacp timeout {long | short}
  setLacpTimeout: (target, timeout) => buildInterfaceCommand(target, `lacp timeout ${timeout}`),
};
