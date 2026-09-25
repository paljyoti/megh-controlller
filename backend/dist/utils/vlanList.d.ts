export declare const isValidVlanNumber: (n: number) => boolean;
export declare const parseVlanRange: (raw: string) => {
    ids: number[];
    spec: string;
} | {
    error: string;
};
export type VlanListValue = {
    kind: "all";
} | {
    kind: "none";
} | {
    kind: "ids";
    ids: number[];
};
export declare const parseVlanList: (raw: string) => {
    value: VlanListValue;
    spec: string;
} | {
    error: string;
};
//# sourceMappingURL=vlanList.d.ts.map