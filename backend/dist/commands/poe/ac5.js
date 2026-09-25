import { buildInterfaceCommand } from "../types.js";
export const poeAc5 = {
    // CLI ref: "Configurint the External Powersupply" — SWITCH(config)#poe powersupply POWER
    setPowerSupply: (watts) => ({ command: `poe powersupply ${watts}`, mode: "config" }),
    clearPowerSupply: () => ({ command: "no poe powersupply", mode: "config" }),
    // CLI ref: "Enabling Powersupply Legacy Mode" — SWITCH(config)#poe legacy / no poe legacy
    setLegacyMode: (on) => ({ command: on ? "poe legacy" : "no poe legacy", mode: "config" }),
    // CLI ref: "Enabling Port Powersupply" — SWITCH(config-if)#poe enable / no poe enable
    setPortEnabled: (target, enabled) => buildInterfaceCommand(target, enabled ? "poe enable" : "no poe enable"),
};
//# sourceMappingURL=ac5.js.map