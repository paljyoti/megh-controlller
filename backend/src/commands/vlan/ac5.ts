import type { VlanCommandBuilder } from "./types.js";

export const vlanAc5: VlanCommandBuilder = {
  create: (vlanId) => ({ command: `vlan ${vlanId}`, mode: "config" }),
  delete: (vlanId) => ({ command: `no vlan ${vlanId}`, mode: "config" }),
};
