export interface MacTableRow {
    vlanId: number;
    mac: string;
    type: string;
    port: string;
    forward: boolean;
    learnedAt: string | null;
}
export declare const normalizeMac: (raw: string) => string | null;
export declare const macToColon: (dotted: string) => string;
export declare const macOui: (dotted: string) => string;
export declare const parseMacTable: (text: string) => MacTableRow[];
//# sourceMappingURL=macTableParser.d.ts.map