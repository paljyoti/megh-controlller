import type { CommandSpec } from "../types.js";

export interface SystemCommandBuilder {
  showVersion: () => CommandSpec;
  // CLI ref: "Configuring Hostname" — SWITCH(config)# hostname WORD / no hostname (max 63 bytes)
  setHostname: (name: string) => CommandSpec;
  clearHostname: () => CommandSpec;
  // CLI ref: "Setting Ntp Server" — SWITCH(config)# ntp server A.B.C.D (IPv4 only)
  setNtpServer: (ipv4: string) => CommandSpec;
  // CLI ref: "Setting Timezone" — SWITCH(config)# clock timezone ZONE
  setTimezone: (zone: string) => CommandSpec;
  // CLI ref: "Enable WEB Server" — SWITCH(config)# web-server enable {all|http|https} / no web-server enable
  setWebServer: (mode: "all" | "http" | "https" | null) => CommandSpec;
  // CLI ref: "Enable Telnet Server" — SWITCH(config)# telnet-server enable / no telnet-server enable
  setTelnetServer: (enabled: boolean) => CommandSpec;
  // CLI ref: "Enable SSH Server" — SWITCH(config)# ssh-server enable / no ssh-server enable
  setSshServer: (enabled: boolean) => CommandSpec;
  // CLI ref: "Configuring Management IP" — static form takes vlan+addr+gateway in one command;
  // DHCP form omits the address. `no management vlan` removes it (either form).
  setManagementIpStatic: (vlanId: number, cidr: string, gateway: string) => CommandSpec;
  setManagementIpDhcp: (vlanId: number) => CommandSpec;
  clearManagementIp: () => CommandSpec;
  // CLI ref: "Manually Assigning IPv6 Information" / "Configuring DHCP-Based IPv6 Information
  // Autoconfiguration" — same shape as the IPv4 forms above, parallel CLI section. The doc only
  // documents one clear command ("no management vlan") for the whole management-IP feature, so
  // clearManagementIp is shared between IPv4 and IPv6 — it's unclear from the CLI reference
  // whether clearing one clears both, since this was never live-tested (see systemController.ts).
  setManagementIpv6Static: (vlanId: number, cidr: string, gateway: string) => CommandSpec;
  setManagementIpv6Dhcp: (vlanId: number) => CommandSpec;
  // CLI ref: "Backup Configuration" — SWITCH#write
  writeConfig: () => CommandSpec;
  // CLI ref: "System Warm Restart" — SWITCH#reload
  reload: () => CommandSpec;
  // CLI ref: "Restore Configuration" — SWITCH#copy default-config startup-config, then reload
  // to take effect. factoryRestore() only issues the copy step; the caller reloads separately
  // so the two remain individually retryable/observable.
  factoryRestoreConfig: () => CommandSpec;
}
