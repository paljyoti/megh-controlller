// Run: npx tsx --test tests/modelRegistry.test.ts   (from backend/; uses Node's built-in runner)
import { test } from "node:test";
import assert from "node:assert/strict";
import { getDeviceCapabilities, getDeviceCommands } from "../src/commands/registry.ts";

const MANAGED = "Managed Ethernet Switch";
const TR = "TR-MS2910-P";

test("Managed Ethernet Switch enables LLDP", () => {
  assert.equal(getDeviceCapabilities(MANAGED).lldp, true);
});

test("Managed Ethernet Switch reuses AC5 commands and capabilities except lldp", () => {
  assert.equal(getDeviceCommands(MANAGED), getDeviceCommands("unknown-model"));
  assert.deepEqual(getDeviceCapabilities(MANAGED), { ...getDeviceCapabilities("unknown-model"), lldp: true });
  assert.equal(getDeviceCapabilities(MANAGED).loopDetection, false);
  assert.equal(getDeviceCapabilities(MANAGED).stp, false);
});

test("AC5 fallback is unchanged: LLDP stays off", () => {
  assert.equal(getDeviceCapabilities("unknown-model").lldp, false);
  assert.equal(getDeviceCapabilities("unknown-model").loopDetection, false);
});

test("TR behaviour is unchanged", () => {
  const caps = getDeviceCapabilities(TR);
  assert.equal(caps.lldp, true);
  assert.equal(caps.loopDetection, true);
  assert.equal(caps.stp, true);
  const cmds = getDeviceCommands(TR);
  assert.notEqual(cmds, getDeviceCommands("unknown-model"));
  assert.ok(cmds.loopDetect);
  assert.ok(cmds.stp);
});

test("unknown or empty models fall back to AC5", () => {
  for (const model of ["", "does-not-exist", "managed ethernet switch"]) {
    assert.equal(getDeviceCommands(model), getDeviceCommands("another-unknown"));
    assert.equal(getDeviceCapabilities(model).lldp, false);
    assert.equal(getDeviceCommands(model).loopDetect, undefined);
    assert.equal(getDeviceCommands(model).stp, undefined);
  }
});
