import type { CommandMode } from "../interfaces/mqttInterface.js";

interface CommandSpec {
  command: string;
  mode: CommandMode;
}

interface DeviceCommandSet {
  vlan: {
    create: (vlanId: number) => CommandSpec;
    delete: (vlanId: number) => CommandSpec;
  };
  system: {
    showVersion: () => CommandSpec;
  };
  // future feature namespaces go here: stp, lacp, portSecurity, routeConfig, loopDetection...
}

const defaultCommands: DeviceCommandSet = {
  vlan: {
    create: (vlanId) => ({ command: `vlan ${vlanId}`, mode: "config" }),
    delete: (vlanId) => ({ command: `no vlan ${vlanId}`, mode: "config" }),
  },
  system: {
    showVersion: () => ({ command: "show version", mode: "exec" }),
  },
};

// Per-model overrides, keyed by Device.model. Empty today — add an entry here only when a
// specific model needs different CLI wording than the default.
const modelOverrides: Record<string, Partial<DeviceCommandSet>> = {};

export const getDeviceCommands = (model: string): DeviceCommandSet => ({
  ...defaultCommands,
  ...modelOverrides[model],
});
