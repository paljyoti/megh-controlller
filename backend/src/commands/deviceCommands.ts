// Thin re-export barrel — kept so every existing import path (`../commands/deviceCommands.js`)
// keeps working unchanged. The actual per-feature, per-model command logic now lives under
// commands/<feature>/{types,ac5}.ts, composed in commands/registry.ts.
export { getDeviceCommands, getDeviceCapabilities } from "./registry.js";
export type { DeviceCommandSet } from "./registry.js";
export type { CommandSpec, InterfaceTarget } from "./types.js";
export type { ModelCapabilities } from "./capabilities.js";
