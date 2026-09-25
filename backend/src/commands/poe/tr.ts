import { buildInterfaceCommand } from "../types.js";
import { poeAc5 } from "./ac5.js";
import type { PoeCommandBuilder } from "./types.js";

export const poeTr: PoeCommandBuilder = {
  // Confirmed identical to AC5 live: "poe powersupply VALUE" / "no poe powersupply",
  // "poe enable" / "no poe enable" (per-port).
  setPowerSupply: poeAc5.setPowerSupply,
  clearPowerSupply: poeAc5.clearPowerSupply,
  setPortEnabled: poeAc5.setPortEnabled,
  // No setLegacyMode — TR's global `poe ?` doesn't list "legacy" at all.

  setPowerAlarm: (percent) =>
    percent === null
      ? { command: "no poe power-alarm", mode: "config" }
      : { command: `poe power-alarm ${percent}`, mode: "config" },
  setPowerReserved: (percent) => ({ command: `poe power-reserved ${percent}`, mode: "config" }),
  setPortForceOn: (target) => buildInterfaceCommand(target, "poe force on"),
  clearPortForce: (target) => buildInterfaceCommand(target, "no poe force"),
  setPortPriority: (target, priority) => buildInterfaceCommand(target, `poe priority ${priority}`),
  setPortMaxPower: (target, watts) =>
    watts === null
      ? buildInterfaceCommand(target, "no poe max-power")
      : buildInterfaceCommand(target, `poe max-power ${watts}`),
  setPortLegacyMode: (target, enabled) =>
    buildInterfaceCommand(target, enabled ? "poe legacy" : "no poe legacy"),
  setPortPdDescription: (target, description) =>
    description
      ? buildInterfaceCommand(target, `poe pd-description ${description}`)
      : buildInterfaceCommand(target, "no poe pd-description"),

  setPortPdDetectByFlow: (target) => buildInterfaceCommand(target, "poe pd-detect mode by-flow"),
  setPortPdDetectByPing: (target, peerIp) => buildInterfaceCommand(target, `poe pd-detect mode by-ping ${peerIp}`),
  clearPortPdDetectMode: (target) => buildInterfaceCommand(target, "no poe pd-detect mode"),
  setPortPdDetectParams: (target, intervalSeconds, times) =>
    buildInterfaceCommand(target, `poe pd-detect parameter interval ${intervalSeconds} times ${times}`),
  clearPortPdDetectParams: (target) => buildInterfaceCommand(target, "no poe pd-detect parameter"),
};
