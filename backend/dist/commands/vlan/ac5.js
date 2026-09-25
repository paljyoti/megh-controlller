export const vlanAc5 = {
    create: (vlanId) => ({ command: `vlan ${vlanId}`, mode: "config" }),
    delete: (vlanId) => ({ command: `no vlan ${vlanId}`, mode: "config" }),
};
//# sourceMappingURL=ac5.js.map