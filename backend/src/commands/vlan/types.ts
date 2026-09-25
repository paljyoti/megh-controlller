import type { CommandSpec } from "../types.js";

export interface VlanCommandBuilder {
  // vlanIdOrRange also accepts a range string, e.g. "2-10" (CLI ref: "Creating VLAN" —
  // "vlan-id 1-4094, vlan-range example: 2-10").
  create: (vlanIdOrRange: number | string) => CommandSpec;
  delete: (vlanIdOrRange: number | string) => CommandSpec;
}
