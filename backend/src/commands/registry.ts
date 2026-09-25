import type { VlanCommandBuilder } from "./vlan/index.js";
import { vlanAc5 } from "./vlan/index.js";
import type { RouteCommandBuilder } from "./route/index.js";
import { routeAc5, routeTr } from "./route/index.js";
import type { PortSecurityCommandBuilder } from "./portSecurity/index.js";
import { portSecurityAc5, portSecurityTr } from "./portSecurity/index.js";
import type { DhcpCommandBuilder } from "./dhcp/index.js";
import { dhcpAc5 } from "./dhcp/index.js";
import type { LinkAggregationCommandBuilder } from "./linkAggregation/index.js";
import { linkAggregationAc5 } from "./linkAggregation/index.js";
import type { PortCommandBuilder } from "./port/index.js";
import { portAc5 } from "./port/index.js";
import type { L3CommandBuilder } from "./l3/index.js";
import { l3Ac5 } from "./l3/index.js";
import type { PoeCommandBuilder } from "./poe/index.js";
import { poeAc5, poeTr } from "./poe/index.js";
import type { SystemCommandBuilder } from "./system/index.js";
import { systemAc5 } from "./system/index.js";
import type { LoopDetectCommandBuilder } from "./loopDetect/index.js";
import { loopDetectTr } from "./loopDetect/index.js";
import type { StpCommandBuilder } from "./stp/index.js";
import { stpTr } from "./stp/index.js";
import type { TopologyCommandBuilder } from "./topology/index.js";
import { topologyAc5 } from "./topology/index.js";
import type { ModelCapabilities } from "./capabilities.js";

// The full per-device command surface: one builder per feature, composed from whichever
// model implements it. Controllers only ever see this shape — never a specific vendor's file.
// loopDetect/stp are optional: AC5 has no equivalent CLI at all (confirmed absent from its
// reference doc) — controllers must check getDeviceCapabilities(model) before assuming these
// exist, the same way they'd check for any other model-dependent feature.
export interface DeviceCommandSet {
  vlan: VlanCommandBuilder;
  route: RouteCommandBuilder;
  portSecurity: PortSecurityCommandBuilder;
  dhcp: DhcpCommandBuilder;
  linkAggregation: LinkAggregationCommandBuilder;
  port: PortCommandBuilder;
  l3: L3CommandBuilder;
  poe: PoeCommandBuilder;
  system: SystemCommandBuilder;
  // Read-only discovery ("show mac-address-table" / LLDP) — see commands/topology.
  topology: TopologyCommandBuilder;
  loopDetect?: LoopDetectCommandBuilder;
  stp?: StpCommandBuilder;
}

const ac5Commands: DeviceCommandSet = {
  vlan: vlanAc5,
  route: routeAc5,
  portSecurity: portSecurityAc5,
  dhcp: dhcpAc5,
  linkAggregation: linkAggregationAc5,
  port: portAc5,
  l3: l3Ac5,
  poe: poeAc5,
  system: systemAc5,
  topology: topologyAc5,
};

const ac5Capabilities: ModelCapabilities = {
  vlan: true,
  route: true,
  portSecurity: true,
  dhcp: true,
  linkAggregation: true,
  port: true,
  l3: true,
  poe: true,
  system: true,
  loopDetection: false,
  stp: false,
};

// TR-family switches (confirmed against the TR-S2528D-2AC configuration guide plus live
// terminal testing on the platform's actual device, model "TR-MS2910-P" — same TR CLI family,
// per user confirmation). vlan/linkAggregation/port/l3/system are reused directly from AC5
// (verified identical by doc comparison); poe has its own TR builder (per-port legacy/priority/
// max-power/force/pd-description confirmed live, absent from AC5 entirely); portSecurity has
// its own TR builder (different MAC format + mandatory VLAN); route has its own TR builder too
// — confirmed live that TR's "no ip route" form requires the next-hop/interface argument
// (AC5's doesn't — see route/ac5.ts vs route/tr.ts for why each omits/includes it).
const trCommands: DeviceCommandSet = {
  vlan: vlanAc5,
  route: routeTr,
  linkAggregation: linkAggregationAc5,
  port: portAc5,
  l3: l3Ac5,
  poe: poeTr,
  system: systemAc5,
  topology: topologyAc5,
  portSecurity: portSecurityTr,
  // NOT yet fixed for TR — AC5's DHCP CLI is confirmed architecturally incompatible with TR's
  // nested subnet/pool syntax (see conversation history). Reusing it here is a known, deliberate
  // no-op vs. today's behavior (every device already falls back to this same AC5 dhcp builder,
  // so this isn't a regression) — building TR's real DHCP support is a separate, larger task.
  dhcp: dhcpAc5,
  loopDetect: loopDetectTr,
  stp: stpTr,
};

const trCapabilities: ModelCapabilities = {
  ...ac5Capabilities,
  loopDetection: true,
  stp: true,
};

// Keyed by Device.model. Add an entry here (and the matching feature-module files) when a new
// switch model needs different CLI wording than AC5 — no controller changes required.
const modelRegistry: Record<string, { commands: DeviceCommandSet; capabilities: ModelCapabilities }> = {
  "TR-MS2910-P": { commands: trCommands, capabilities: trCapabilities },
};

// Unrecognized/unset Device.model falls back to AC5 defaults — matches today's behavior.
export const getDeviceCommands = (model: string): DeviceCommandSet =>
  modelRegistry[model]?.commands ?? ac5Commands;

export const getDeviceCapabilities = (model: string): ModelCapabilities =>
  modelRegistry[model]?.capabilities ?? ac5Capabilities;
