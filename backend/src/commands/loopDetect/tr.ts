import { buildInterfaceCommand } from "../types.js";
import type { LoopDetectCommandBuilder } from "./types.js";

export const loopDetectTr: LoopDetectCommandBuilder = {
  setGlobalEnabled: (enabled) => ({
    command: enabled ? "loop-detect enable" : "no loop-detect enable",
    mode: "config",
  }),
  setPortEnabled: (target, enabled) =>
    buildInterfaceCommand(target, enabled ? "loop-detect enable" : "no loop-detect enable"),
  setPortAction: (target, action) => buildInterfaceCommand(target, `loop-detect action ${action}`),
  setPortVlans: (target, vlanSpec) =>
    vlanSpec
      ? buildInterfaceCommand(target, `loop-detect vlan ${vlanSpec}`)
      : buildInterfaceCommand(target, "no loop-detect vlan"),
  setInterval: (seconds) => ({ command: `loop-detect interval ${seconds}`, mode: "config" }),
  setErrdisableTimeoutEnabled: (enabled) => ({
    command: `errdisable timeout ${enabled ? "enable" : "disable"}`,
    mode: "config",
  }),
  setErrdisableTimeoutInterval: (seconds) => ({
    command: `errdisable timeout interval ${seconds}`,
    mode: "config",
  }),
  recoverErrdisablePort: (port) => ({ command: `errdisable recovery interface ${port}`, mode: "exec" }),
  setTrapEnabled: (enabled) => ({
    command: enabled ? "loop-detect trap enable" : "no loop-detect trap enable",
    mode: "config",
  }),
};
