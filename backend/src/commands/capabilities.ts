// Queryable per-model feature support, so controllers/frontend can check what a switch model
// supports instead of hardcoding assumptions. Populated per model in registry.ts.
export interface ModelCapabilities {
  vlan: boolean;
  route: boolean;
  portSecurity: boolean;
  dhcp: boolean;
  linkAggregation: boolean;
  port: boolean;
  l3: boolean;
  poe: boolean;
  system: boolean;
  // Not implemented for any model yet — no CLI reference found in any switch's config guide so far.
  loopDetection: boolean;
  stp: boolean;
}
