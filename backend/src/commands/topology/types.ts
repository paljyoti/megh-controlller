import type { CommandSpec } from "../types.js";

// Topology discovery is READ-ONLY: every builder here is a "show" command in exec mode.
// Nothing in this module may enter config mode — the poller runs these unattended against
// production uplinks (see services/topology/topologyPoller.ts).
export interface TopologyCommandBuilder {
  // CLI ref (TR guide "show mac-address-table") — confirmed live 2026-09-18 on TR-MS2910-P:
  //   VLAN  MAC Address      Type     Ports                 FWD  Time
  //   1     aaea.6976.77e2   dynamic  gigabitEthernet0/6    1    2026-09-18 14:41:10
  showMacTable: () => CommandSpec;
  // CLI ref (TR guide §14 LLDP): "show lldp interface <port> neighbor" is documented per
  // interface; a no-argument form is NOT confirmed. Not used by the poller until output has
  // been seen from a real neighbour.
  showLldpNeighbor: (port: string) => CommandSpec;
}
