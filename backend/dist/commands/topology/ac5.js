// Shared by AC5 and TR — "show mac-address-table" wording is identical in both CLI families
// (confirmed live on TR; AC5 doc lists the same command). LLDP is TR-documented only; AC5's
// CLI-MQTT doc doesn't mention it, so on AC5 this builder is present but unverified.
export const topologyAc5 = {
    showMacTable: () => ({ command: "show mac-address-table", mode: "exec" }),
    showLldpNeighbor: (port) => ({ command: `show lldp interface ${port} neighbor`, mode: "exec" }),
};
//# sourceMappingURL=ac5.js.map