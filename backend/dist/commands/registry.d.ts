import type { VlanCommandBuilder } from "./vlan/index.js";
import type { RouteCommandBuilder } from "./route/index.js";
import type { PortSecurityCommandBuilder } from "./portSecurity/index.js";
import type { DhcpCommandBuilder } from "./dhcp/index.js";
import type { LinkAggregationCommandBuilder } from "./linkAggregation/index.js";
import type { PortCommandBuilder } from "./port/index.js";
import type { L3CommandBuilder } from "./l3/index.js";
import type { PoeCommandBuilder } from "./poe/index.js";
import type { SystemCommandBuilder } from "./system/index.js";
import type { LoopDetectCommandBuilder } from "./loopDetect/index.js";
import type { StpCommandBuilder } from "./stp/index.js";
import type { TopologyCommandBuilder } from "./topology/index.js";
import type { ModelCapabilities } from "./capabilities.js";
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
    topology: TopologyCommandBuilder;
    loopDetect?: LoopDetectCommandBuilder;
    stp?: StpCommandBuilder;
}
export declare const getDeviceCommands: (model: string) => DeviceCommandSet;
export declare const getDeviceCapabilities: (model: string) => ModelCapabilities;
//# sourceMappingURL=registry.d.ts.map