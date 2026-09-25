import type { CommandMode } from "../interfaces/mqttInterface.js";

export interface CommandSpec {
  command: string;
  mode: CommandMode;
  // Optional MQTT params, e.g. the interface-context stack (see buildInterfaceCommand below).
  // Spreads straight into deviceCommand.ts's CommandInput.
  params?: Record<string, unknown>;
}

// A single port ("gigabitEthernet0/1"), a bulk range ("gigabitEthernet0/1-4,gigabitEthernet0/9-12"),
// or a VLAN SVI ("vlan15"). CLI ref: "Configuring Interface Range Mode" — up to five
// comma-separated ranges, each range must be a single port type.
export type InterfaceTarget =
  | { kind: "single"; port: string }
  | { kind: "range"; rangeSpec: string }
  | { kind: "svi"; vlanId: number };

const interfaceContextLine = (target: InterfaceTarget): string => {
  if (target.kind === "range") return `interface range ${target.rangeSpec}`;
  // CLI ref: "Configuring SVI Port IP/IPv6 Address" — the doc's own example literally uses the
  // abbreviated "int" (not "interface") for entering an SVI's context: "SWITCH(config)#int vlan10".
  if (target.kind === "svi") return `int vlan${target.vlanId}`;
  return `interface ${target.port}`;
};

// CLI ref: "Remarks — Command Line Interface Mode" section documents entering config-if mode
// via a `Pre-command` context stack in `params`, with `command` holding only the innermost
// subcommand. Confirmed working live against a real switch (see conversation) before this
// was wired into any controller. Shared MQTT-level infra — vendor-agnostic, every switch model
// that speaks this protocol enters interface context the same way.
export const buildInterfaceCommand = (target: InterfaceTarget, subcommand: string): CommandSpec => ({
  command: subcommand,
  mode: "config",
  params: { "Pre-command": [interfaceContextLine(target)] },
});
