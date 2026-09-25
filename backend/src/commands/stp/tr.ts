import { buildInterfaceCommand } from "../types.js";
import type { StpCommandBuilder } from "./types.js";

export const stpTr: StpCommandBuilder = {
  setMode: (mode) => ({ command: `spanning-tree mode ${mode}`, mode: "config" }),
  setEnabled: (enabled) => ({
    command: enabled ? "spanning-tree enable" : "no spanning-tree enable",
    mode: "config",
  }),
  setPriority: (priority) => ({ command: `spanning-tree priority ${priority}`, mode: "config" }),
  setHelloTime: (seconds) => ({ command: `spanning-tree hello-time ${seconds}`, mode: "config" }),
  setForwardDelay: (seconds) => ({ command: `spanning-tree forward-time ${seconds}`, mode: "config" }),
  setMaxAge: (seconds) => ({ command: `spanning-tree max-age ${seconds}`, mode: "config" }),
  setPortPriority: (target, priority) => buildInterfaceCommand(target, `spanning-tree priority ${priority}`),
  setPortPathCost: (target, cost) =>
    cost === null
      ? buildInterfaceCommand(target, "no spanning-tree path-cost")
      : buildInterfaceCommand(target, `spanning-tree path-cost ${cost}`),
  // "no" form must repeat whichever keyword (edgeport/autoedge) was previously set — the CLI
  // ref shows both keywords accepted by the same "no spanning-tree <edgeport|autoedge>" form,
  // but doesn't say "no spanning-tree edgeport" clears an "autoedge" setting or vice versa.
  setPortEdgeMode: (target, mode, previous) => {
    if (mode) return buildInterfaceCommand(target, `spanning-tree ${mode}`);
    return buildInterfaceCommand(target, `no spanning-tree ${previous ?? "edgeport"}`);
  },
  setPortBpduGuard: (target, enabled) =>
    buildInterfaceCommand(target, `spanning-tree bpdu-guard ${enabled ? "enable" : "disable"}`),
};
