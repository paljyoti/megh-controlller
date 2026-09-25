import type { DhcpCommandBuilder, DhcpPoolCommandParams } from "./types.js";

const buildDhcpPoolCommand = ({
  poolName,
  network,
  netmask,
  gateway,
  leasePeriod,
  leaseDays,
  leaseHours,
  leaseMinutes,
  dns,
  backupDns,
  option43,
  addressSegments,
}: DhcpPoolCommandParams): string => {
  const lines = [`ip dhcp pool ${poolName}`, `network ${network} ${netmask}`];
  if (gateway) lines.push(`default-router ${gateway}`);
  lines.push(`dns-server ${dns}${backupDns ? ` ${backupDns}` : ""}`);
  if (option43) lines.push(`option 43 ascii ${option43}`);
  lines.push(
    leasePeriod === "custom"
      ? `lease ${leaseDays ?? 0} ${leaseHours ?? 0} ${leaseMinutes ?? 0}`
      : "lease infinite"
  );
  for (const seg of addressSegments) lines.push(`address range ${seg.start} ${seg.end}`);
  return lines.join("\n");
};

export const dhcpAc5: DhcpCommandBuilder = {
  create: (params) => ({ command: buildDhcpPoolCommand(params), mode: "config" }),
  delete: (poolName) => ({ command: `no ip dhcp pool ${poolName}`, mode: "config" }),
  setStatus: (poolName, status) => ({
    command: `dhcp pool ${poolName} ${status === "enabled" ? "enable" : "disable"}`,
    mode: "config",
  }),
  setNakStatus: (poolName, nakStatus) => ({
    command: `dhcp pool ${poolName} nak ${nakStatus === "enabled" ? "enable" : "disable"}`,
    mode: "config",
  }),
};
