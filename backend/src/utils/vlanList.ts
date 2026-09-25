// Shared VLAN ID / VLAN list / VLAN range parsing, per the CLI reference's conventions:
// - "vlan-list parameter is either a single VLAN number from 1 to 4094 or a range ... the
//   lower one first ... Do not enter any spaces between comma-separated VLAN parameters or
//   in hyphen-specified ranges."
// - VLAN range for creation, e.g. "2-10" (CLI ref: "Creating VLAN").

const MIN_VLAN = 1;
const MAX_VLAN = 4094;

export const isValidVlanNumber = (n: number): boolean =>
  Number.isInteger(n) && n >= MIN_VLAN && n <= MAX_VLAN;

// Parses a single "vlan-id" or "vlan-range" (e.g. "5" or "2-10") used for VLAN create/delete.
// Returns the expanded set of individual VLAN IDs plus the original spec string (used as-is
// in the CLI command, since the switch accepts the range form directly).
export const parseVlanRange = (
  raw: string
): { ids: number[]; spec: string } | { error: string } => {
  const trimmed = raw.trim();
  if (/\s/.test(trimmed)) return { error: "VLAN range must not contain spaces" };

  const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const lo = Number(rangeMatch[1]);
    const hi = Number(rangeMatch[2]);
    if (lo >= hi) return { error: "VLAN range must have the lower number first, e.g. 2-10" };
    if (!isValidVlanNumber(lo) || !isValidVlanNumber(hi))
      return { error: `VLAN IDs must be between ${MIN_VLAN} and ${MAX_VLAN}` };
    const ids: number[] = [];
    for (let v = lo; v <= hi; v++) ids.push(v);
    return { ids, spec: trimmed };
  }

  if (/^\d+$/.test(trimmed)) {
    const v = Number(trimmed);
    if (!isValidVlanNumber(v)) return { error: `VLAN ID must be between ${MIN_VLAN} and ${MAX_VLAN}` };
    return { ids: [v], spec: trimmed };
  }

  return { error: "VLAN id/range must be a number (e.g. 5) or a range (e.g. 2-10)" };
};

export type VlanListValue = { kind: "all" } | { kind: "none" } | { kind: "ids"; ids: number[] };

// Parses a trunk/hybrid "allowed vlan" or "untagged vlan" list: "all", "none", or a
// comma-separated list of IDs/ranges with no spaces, e.g. "2,5-10,4094".
export const parseVlanList = (raw: string): { value: VlanListValue; spec: string } | { error: string } => {
  const trimmed = raw.trim();
  if (trimmed === "all") return { value: { kind: "all" }, spec: "all" };
  if (trimmed === "none" || trimmed === "") return { value: { kind: "none" }, spec: "none" };
  if (/\s/.test(trimmed))
    return { error: "VLAN list must not contain spaces between comma-separated parameters" };

  const ids = new Set<number>();
  for (const part of trimmed.split(",")) {
    if (part === "") return { error: "VLAN list has an empty entry (check for a trailing comma)" };
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const lo = Number(rangeMatch[1]);
      const hi = Number(rangeMatch[2]);
      if (lo >= hi) return { error: `Range "${part}" must have the lower number first` };
      if (!isValidVlanNumber(lo) || !isValidVlanNumber(hi))
        return { error: `VLAN IDs must be between ${MIN_VLAN} and ${MAX_VLAN}` };
      for (let v = lo; v <= hi; v++) ids.add(v);
    } else if (/^\d+$/.test(part)) {
      const v = Number(part);
      if (!isValidVlanNumber(v)) return { error: `VLAN IDs must be between ${MIN_VLAN} and ${MAX_VLAN}` };
      ids.add(v);
    } else {
      return { error: `Invalid VLAN list entry: "${part}"` };
    }
  }
  return { value: { kind: "ids", ids: [...ids].sort((a, b) => a - b) }, spec: trimmed };
};
