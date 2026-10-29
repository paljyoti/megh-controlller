// Run: npx tsx --test tests/lldpParser.test.ts   (from backend/; uses Node's built-in runner)
// Kept outside src/ on purpose: tsconfig has `types: []` and includes only src/, so a test file
// under src/ would break `tsc -b` (and therefore the Docker build) on the node:test imports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLldpNeighbors } from "../src/services/topology/lldpParser.ts";

const entry = (opts: { port: string; ttl?: string; mac?: string; ip?: string; name?: string }) =>
  [
    `Interface Name        : ${opts.port}`,
    `Neighbor               : 08-DF-CB-00-03-76`,
    `    System Name             : ${opts.name ?? "Switch"}`,
    `    System Description      : Systrome(tm) SE228C Software, Version 2.1.1B`,
    `    Port Description        : FastEthernet0/16`,
    ...(opts.ttl === undefined ? [] : [`    TTL                     : ${opts.ttl}`]),
    `    Management IP Address: ${opts.ip ?? "172.16.0.80"}`,
    `      Chassis MAC Address: ${opts.mac ?? "08df.cb00.0362"}`,
    `      LOCALLY ASSIGNED: Fas0/16`,
    ``,
  ].join("\n");

const ttlOf = (raw: string | undefined) => parseLldpNeighbors(entry({ port: "gi0/1", ttl: raw }))[0]?.ttlSeconds;

test("valid TTL values are kept", () => {
  assert.equal(ttlOf("120"), 120);
  assert.equal(ttlOf("1"), 1);
  assert.equal(ttlOf("65535"), 65535);
});

test("invalid or missing TTL values become null", () => {
  for (const bad of ["0", "-5", "+5", "1.5", "abc", "120 seconds", "1e3", "0x10", "65536", "99999999999", " "]) {
    assert.equal(ttlOf(bad), null, `TTL ${JSON.stringify(bad)} should be null`);
  }
  assert.equal(ttlOf(undefined), null, "missing TTL line should be null");
});

test("multiple neighbour entries are split and parsed independently", () => {
  const text =
    entry({ port: "gigabitEthernet0/8", ttl: "120" }) +
    entry({ port: "gigabitEthernet0/9", ttl: "bogus", mac: "aabb.cc00.0001", ip: "10.0.0.2", name: "SW2" });
  const rows = parseLldpNeighbors(text);

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.localPort),
    ["gigabitEthernet0/8", "gigabitEthernet0/9"],
  );
  assert.equal(rows[0]?.remoteChassisId, "08df.cb00.0362");
  assert.equal(rows[0]?.remoteMgmtIp, "172.16.0.80");
  assert.equal(rows[0]?.remotePort, "FastEthernet0/16");
  assert.equal(rows[0]?.ttlSeconds, 120);
  assert.equal(rows[1]?.remoteChassisId, "aabb.cc00.0001");
  assert.equal(rows[1]?.remoteMgmtIp, "10.0.0.2");
  assert.equal(rows[1]?.remoteSystemName, "SW2");
  assert.equal(rows[1]?.ttlSeconds, null, "one bad TTL must not affect the other entry");
});

test("blank and unrecognized text produce no rows", () => {
  assert.deepEqual(parseLldpNeighbors(""), []);
  assert.deepEqual(parseLldpNeighbors("  \n\t\n"), []);
  assert.deepEqual(parseLldpNeighbors("% LLDP is not enabled"), []);
  assert.deepEqual(parseLldpNeighbors("show lldp neighbors"), []);
});
