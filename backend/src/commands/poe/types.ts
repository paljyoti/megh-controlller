import type { CommandSpec, InterfaceTarget } from "../types.js";

export interface PoeCommandBuilder {
  // CLI ref: "Configuring the External Powersupply" — SWITCH(config)# poe powersupply POWER / no poe powersupply
  setPowerSupply: (watts: number) => CommandSpec;
  clearPowerSupply: () => CommandSpec;
  // CLI ref: "Enabling Powersupply Legacy Mode" — SWITCH(config)# poe legacy / no poe legacy
  // AC5 only — confirmed global. TR's global `poe ?` doesn't list "legacy" at all (only
  // power-alarm/power-reserved/powersupply); TR does legacy per-port instead (setPortLegacyMode).
  setLegacyMode?: (on: boolean) => CommandSpec;
  // CLI ref: "Enabling Port Powersupply" — SWITCH(config-if)# poe enable / no poe enable
  setPortEnabled: (target: InterfaceTarget, enabled: boolean) => CommandSpec;

  // ─── TR models only — confirmed live against a real TR-MS2910-P terminal ──────────
  // "poe power-alarm VALUE" (50-99 percent); null clears it back to "None" (assumed
  // "no poe power-alarm" — not explicitly seen live, but matches every other poe "no" form).
  setPowerAlarm?: (percent: number | null) => CommandSpec;
  // "poe power-reserved VALUE" (0-50 percent).
  setPowerReserved?: (percent: number) => CommandSpec;
  // "poe force on" (config-if). Reverse form ("no poe force") assumed, not seen live —
  // the terminal capture only showed "poe force ?" -> "on   Power on".
  setPortForceOn?: (target: InterfaceTarget) => CommandSpec;
  clearPortForce?: (target: InterfaceTarget) => CommandSpec;
  // "poe priority {high|low|medium}" (config-if) — confirmed, "poe priority high ?" -> <cr>.
  setPortPriority?: (target: InterfaceTarget, priority: "low" | "medium" | "high") => CommandSpec;
  // "poe max-power VALUE" (config-if) — confirmed range is port-type dependent: 1-30 for
  // .3at ports, 1-90 for .3bt ports; the switch enforces the real bound, we only check 1-90.
  // null clears it (assumed "no poe max-power" — not seen live).
  setPortMaxPower?: (target: InterfaceTarget, watts: number | null) => CommandSpec;
  // "poe legacy" (config-if) — confirmed per-port on TR ("poe legacy ?" -> <cr>, toggle-only).
  setPortLegacyMode?: (target: InterfaceTarget, enabled: boolean) => CommandSpec;
  // "poe pd-description" (config-if) — a separate field from the port's own `description`.
  // Max 32 chars (confirmed live). Exact clear form not seen live; assumed "no poe pd-description".
  setPortPdDescription?: (target: InterfaceTarget, description: string | null) => CommandSpec;

  // "poe pd-detect mode by-flow" (config-if) — confirmed live, standalone.
  setPortPdDetectByFlow?: (target: InterfaceTarget) => CommandSpec;
  // "poe pd-detect mode by-ping IPADDR" (config-if) — confirmed live, requires the peer IP.
  setPortPdDetectByPing?: (target: InterfaceTarget, peerIp: string) => CommandSpec;
  // Clear form not seen live; assumed "no poe pd-detect mode".
  clearPortPdDetectMode?: (target: InterfaceTarget) => CommandSpec;
  // "poe pd-detect parameter interval VALUE times VALUE" (config-if) — confirmed live as ONE
  // command setting both values together (interval: 5-60s, times: 3-30).
  setPortPdDetectParams?: (target: InterfaceTarget, intervalSeconds: number, times: number) => CommandSpec;
  // Clear form not seen live; assumed "no poe pd-detect parameter".
  clearPortPdDetectParams?: (target: InterfaceTarget) => CommandSpec;
}
