export interface Port {
    portNumber: number;
    status: string;
    linkSpeed: string | null;
    poeEnabled: boolean;
    poeDrawn: number;
    connectedDeviceName: string | null;
    connectedDeviceMac: string | null;
    defaultVlan: string;
    allowedVlans: string[];
}
export interface PoE {
    budget: number;
    available: number;
    used: number;
}
export interface Traffic {
    total: number;
    download: number;
    upload: number;
}
export interface Clients {
    total: number;
    downstreamDevices: number;
}
export interface TopologyLink {
    fromPort: number;
    toDevice: string;
    toPort: number;
    linkType: string;
    linkSpeed: string;
}
export interface Topology {
    uplinkPort: number | null;
    links: TopologyLink[];
}
export interface PoeScheduleAssignment {
    from: string;
    to: string;
}
export interface PoeSchedule {
    name: string;
    assignments: {
        [day: string]: PoeScheduleAssignment[];
    };
}
export interface Switch {
    id: string;
    name: string;
    macAddress: string;
    model: string;
    status: "Online" | "Offline";
    ipAddress: string;
    gatewayIpAddress: string;
    wanIpAddress: string;
    dnsServers: string[];
    serialNumber: string;
    firmwareVersion: string;
    location: string;
    description: string;
    uptime: string;
    lastCheckin: string;
    cpuLoad: number;
    freeMemory: number;
    poe: PoE;
    traffic: Traffic;
    clients: Clients;
    ports: Port[];
    topology: Topology;
    poeSchedules: PoeSchedule[];
}
export declare const mockSwitches: Switch[];
//# sourceMappingURL=data.d.ts.map