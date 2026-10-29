import type { TopologyCommandBuilder } from "./types.js";

// Shared by AC5 and TR — "show mac-address-table" wording is identical in both CLI families
// (confirmed live on TR; AC5 doc lists the same command). LLDP is TR-documented and confirmed
// live on TR (2026-10-15); AC5's CLI-MQTT doc doesn't mention LLDP at all, so this builder is
// present for AC5 only so the interface is satisfied — registry.ts's `lldp` capability flag
// keeps the poller from ever calling it on AC5 until that's verified too.
export const topologyAc5: TopologyCommandBuilder = {
  showMacTable: () => ({ command: "show mac-address-table", mode: "exec" }),
  showLldpNeighbors: () => ({ command: "show lldp neighbors", mode: "exec" }),
};
