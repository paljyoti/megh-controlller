// Parses the free-text "show mac-address-table" output. Confirmed live on TR-MS2910-P
// (2026-09-18):
//
//    VLAN     MAC Address     Type      Ports                  FWD    Time
//    -----+----------------+---------+-----------------------+-----+--------------------+
//    1      aaea.6976.77e2   dynamic   gigabitEthernet0/6      1     2026-09-18 14:41:10
//
// Whitespace-separated columns; the Time column contains a space so it's joined back.
// Accepts "aabb.ccdd.eeff", "AA:BB:CC:DD:EE:FF", "aa-bb-cc-dd-ee-ff", "aabbccddeeff" and
// returns the switch's own dotted form, lower-case, so MAC-table rows and Device.macAddress
// (colon form from first_seen / show version) compare equal.
export const normalizeMac = (raw) => {
    const hex = raw.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
    if (hex.length !== 12)
        return null;
    return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`;
};
// Colon form for display ("aa:bb:cc:dd:ee:ff").
export const macToColon = (dotted) => {
    const hex = dotted.replace(/\./g, "");
    return hex.match(/.{2}/g)?.join(":") ?? dotted;
};
// First 3 bytes, upper-case colon form ("5C:CC:FF") — used to spot same-vendor switches.
export const macOui = (dotted) => macToColon(dotted).slice(0, 8).toUpperCase();
const ROW_RE = /^\s*(\d+)\s+([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\s+(\S+)\s+(\S+)\s+(\d+)\s*(.*)$/;
export const parseMacTable = (text) => {
    const rows = [];
    for (const line of text.split("\n")) {
        const m = ROW_RE.exec(line);
        if (!m)
            continue;
        const mac = normalizeMac(m[2]);
        if (!mac)
            continue;
        rows.push({
            vlanId: Number(m[1]),
            mac,
            type: m[3].toLowerCase(),
            port: m[4],
            forward: m[5] === "1",
            learnedAt: m[6]?.trim() || null,
        });
    }
    return rows;
};
//# sourceMappingURL=macTableParser.js.map