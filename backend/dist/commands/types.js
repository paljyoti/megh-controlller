const interfaceContextLine = (target) => {
    if (target.kind === "range")
        return `interface range ${target.rangeSpec}`;
    // CLI ref: "Configuring SVI Port IP/IPv6 Address" — the doc's own example literally uses the
    // abbreviated "int" (not "interface") for entering an SVI's context: "SWITCH(config)#int vlan10".
    if (target.kind === "svi")
        return `int vlan${target.vlanId}`;
    return `interface ${target.port}`;
};
// CLI ref: "Remarks — Command Line Interface Mode" section documents entering config-if mode
// via a `Pre-command` context stack in `params`, with `command` holding only the innermost
// subcommand. Confirmed working live against a real switch (see conversation) before this
// was wired into any controller. Shared MQTT-level infra — vendor-agnostic, every switch model
// that speaks this protocol enters interface context the same way.
export const buildInterfaceCommand = (target, subcommand) => ({
    command: subcommand,
    mode: "config",
    params: { "Pre-command": [interfaceContextLine(target)] },
});
//# sourceMappingURL=types.js.map