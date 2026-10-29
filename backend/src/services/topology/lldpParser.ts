import { normalizeMac } from "./macTableParser.js";

// Parses the free-text "show lldp neighbors" output. Confirmed live 2026-10-15 against a real
// second switch:
//
//   Interface Name        : gigabitEthernet0/8
//   Neighbor               : 08-DF-CB-00-03-76
//       System Name             : Switch
//       System Description      : Systrome(tm) SE228C Software, Version 2.1.1B
//       Port Description        : FastEthernet0/16
//       TTL                     : 120
//       ...
//       Management IP Address: 172.16.0.80
//       ...
//         Chassis MAC Address: 08df.cb00.0362
//         LOCALLY ASSIGNED: Fas0/16
//
// Each neighbour entry starts with its own "Interface Name :" line, so a response listing
// several neighbours is split on that boundary. The chassis MAC appears twice in different
// formats (dash-separated after "Neighbor", dot-separated after "Chassis MAC Address") —
// normalizeMac() collapses both to the same dotted form used by Device.macAddress.

export interface LldpNeighborRow {
  localPort: string;
  remoteChassisId: string | null; // normalized "aabb.ccdd.eeff"
  remoteSystemName: string | null;
  remotePort: string | null;
  remoteMgmtIp: string | null;
  remoteDescription: string | null;
  ttlSeconds: number | null;
}

// LLDP TTL is a 16-bit unsigned TLV (1-65535 s; 0 means "neighbour going away"). Anything else —
// non-digits, decimals, exponents, hex, signs, out of range, missing — is unknown, not stored.
const parseTtl = (raw: string | null): number | null => {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : null;
};

const field = (block: string, label: string): string | null => {
  const re = new RegExp(`^[ \\t]*${label}[ \\t]*:[ \\t]*(\\S.*)?$`, "m");
  const value = re.exec(block)?.[1]?.trim();
  return value ? value : null;
};

export const parseLldpNeighbors = (text: string): LldpNeighborRow[] => {
  const blocks = text
    .split(/(?=^[ \t]*Interface Name[ \t]*:)/m)
    .map((b) => b.trim())
    .filter(Boolean);

  const rows: LldpNeighborRow[] = [];
  for (const block of blocks) {
    const localPort = field(block, "Interface Name");
    if (!localPort) continue; // command echo / "no neighbours" text, not a real entry

    // Prefer the dot-notation "Chassis MAC Address" TLV; fall back to the dash-separated
    // "Neighbor" summary line if that TLV is missing from a given vendor's output.
    const chassisDot = field(block, "Chassis MAC Address");
    const chassisDash = field(block, "Neighbor");
    const remoteChassisId = normalizeMac(chassisDot ?? chassisDash ?? "");

    const ttlRaw = field(block, "TTL");

    rows.push({
      localPort,
      remoteChassisId,
      remoteSystemName: field(block, "System Name"),
      remotePort: field(block, "Port Description") ?? field(block, "LOCALLY ASSIGNED"),
      remoteMgmtIp: field(block, "Management IP Address"),
      remoteDescription: field(block, "System Description"),
      ttlSeconds: parseTtl(ttlRaw),
    });
  }
  return rows;
};
