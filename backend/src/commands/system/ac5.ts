import type { SystemCommandBuilder } from "./types.js";

export const systemAc5: SystemCommandBuilder = {
  showVersion: () => ({ command: "show version", mode: "exec" }),
  // CLI ref: "Configuring Hostname" — "must consist of printable characters and length cannot
  // exceed 63 bytes"
  setHostname: (name) => ({ command: `hostname ${name}`, mode: "config" }),
  clearHostname: () => ({ command: "no hostname", mode: "config" }),
  setNtpServer: (ipv4) => ({ command: `ntp server ${ipv4}`, mode: "config" }),
  setTimezone: (zone) => ({ command: `clock timezone ${zone}`, mode: "config" }),
  setWebServer: (mode) =>
    mode === null
      ? { command: "no web-server enable", mode: "config" }
      : { command: `web-server enable ${mode}`, mode: "config" },
  setTelnetServer: (enabled) => ({
    command: enabled ? "telnet-server enable" : "no telnet-server enable",
    mode: "config",
  }),
  setSshServer: (enabled) => ({
    command: enabled ? "ssh-server enable" : "no ssh-server enable",
    mode: "config",
  }),
  setManagementIpStatic: (vlanId, cidr, gateway) => ({
    command: `management vlan ${vlanId} ip address ${cidr} gateway ${gateway}`,
    mode: "config",
  }),
  setManagementIpDhcp: (vlanId) => ({
    command: `management vlan ${vlanId} ip address dhcp`,
    mode: "config",
  }),
  clearManagementIp: () => ({ command: "no management vlan", mode: "config" }),
  setManagementIpv6Static: (vlanId, cidr, gateway) => ({
    command: `management vlan ${vlanId} ipv6 address ${cidr} gateway ${gateway}`,
    mode: "config",
  }),
  setManagementIpv6Dhcp: (vlanId) => ({
    command: `management vlan ${vlanId} ipv6 address dhcp`,
    mode: "config",
  }),
  writeConfig: () => ({ command: "write", mode: "exec" }),
  reload: () => ({ command: "reload", mode: "exec" }),
  factoryRestoreConfig: () => ({ command: "copy default-config startup-config", mode: "exec" }),
};
