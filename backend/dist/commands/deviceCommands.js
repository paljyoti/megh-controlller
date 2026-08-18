const defaultCommands = {
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
const modelOverrides = {};
export const getDeviceCommands = (model) => ({
    ...defaultCommands,
    ...modelOverrides[model],
});
//# sourceMappingURL=deviceCommands.js.map