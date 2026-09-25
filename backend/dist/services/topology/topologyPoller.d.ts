export declare const refreshDeviceMacTable: (device: {
    id: string;
    serialNumber: string;
    model: string;
}) => Promise<{
    rows: number;
}>;
export declare const pollAllDevices: () => Promise<void>;
export declare const startTopologyPoller: () => void;
//# sourceMappingURL=topologyPoller.d.ts.map