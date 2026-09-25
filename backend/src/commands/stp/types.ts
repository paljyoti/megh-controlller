import type { CommandSpec, InterfaceTarget } from "../types.js";

// Spanning Tree Protocol — TR models only, no equivalent found in AC5's CLI reference.
// MVP scope: mode/enable, device priority, the three topology-convergence timers, and the
// most common per-port settings (priority, path cost, edge port, BPDU guard). Deliberately
// excludes MSTP region/instance configuration, root guard, BPDU filter, TC-notification,
// link-type, and transmit-holdcount — narrower, less commonly touched settings from the same
// CLI chapter that can be added later the same way (new methods on this interface + tr.ts).
export interface StpCommandBuilder {
  // CLI ref: "Configure STP Mode" — SWITCH(config)#spanning-tree mode <stp | rstp | mstp>
  setMode: (mode: "stp" | "rstp" | "mstp") => CommandSpec;
  // CLI ref: "Enable Spanning Tree Protocol" — SWITCH(config)#spanning-tree enable / no spanning-tree enable
  setEnabled: (enabled: boolean) => CommandSpec;
  // CLI ref: "Configure Device Priority" — SWITCH(config)#spanning-tree priority <0-61440>
  setPriority: (priority: number) => CommandSpec;
  // CLI ref: "Configure Hello Time" — SWITCH(config)#spanning-tree hello-time <1-10>
  setHelloTime: (seconds: number) => CommandSpec;
  // CLI ref: "Configure Forward-Delay Time" — SWITCH(config)#spanning-tree forward-time <4-30>
  setForwardDelay: (seconds: number) => CommandSpec;
  // CLI ref: "Configure Max-Age Time" — SWITCH(config)#spanning-tree max-age <6-40>
  setMaxAge: (seconds: number) => CommandSpec;
  // CLI ref: "Configure Port Priority" — SWITCH(config-if)#spanning-tree priority <0-240>
  setPortPriority: (target: InterfaceTarget, priority: number) => CommandSpec;
  // CLI ref: "Configure Port Path Cost" — SWITCH(config-if)#spanning-tree path-cost <1-200000000> / no spanning-tree path-cost
  setPortPathCost: (target: InterfaceTarget, cost: number | null) => CommandSpec;
  // CLI ref: "Configure Edge Port" — SWITCH(config-if)#spanning-tree <edgeport|autoedge> / no spanning-tree <edgeport|autoedge>
  setPortEdgeMode: (target: InterfaceTarget, mode: "edgeport" | "autoedge" | null, previous: "edgeport" | "autoedge" | null) => CommandSpec;
  // CLI ref: "Configure BPDU Guard" — SWITCH(config-if)#spanning-tree bpdu-guard enable / disable
  setPortBpduGuard: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
}
