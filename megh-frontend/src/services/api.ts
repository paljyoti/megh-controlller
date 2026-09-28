import axios from "axios";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `http://${window.location.hostname}:8082`;
 // `http://122.160.82.93:8082`; // ← for local dev with backend running in Docker on the host, not inside the frontend container
const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export const api = {
  login: (email: string, password: string) =>
    apiClient.post("/user/login", { email, password }),

  logout: () => apiClient.post("/user/logout"),

  getAllDevices: () => apiClient.get("/device"),

  getOnboardDevices: () => apiClient.get("/device/onboard"),

  assignDevice: (deviceId: string, organizationId?: string, userId?: string) =>
    apiClient.post("/device/assign", { deviceId, organizationId, userId }),

  unassignDevice: (deviceId: string) =>
    apiClient.post("/device/unassign", { deviceId }),

  getDeviceTelemetry: (id: string) => apiClient.get(`/device/${id}/telemetry`),

  getDeviceEvents: (id: string, limit = 50) =>
    apiClient.get(`/device/${id}/events`, { params: { limit } }),

  getDeviceStatus: (id: string) => apiClient.get(`/device/${id}/status`),

  getDeviceStatusHistory: (id: string, limit = 50) =>
    apiClient.get(`/device/${id}/status-history`, { params: { limit } }),

  // Backend requires `mode` — "exec" for show/diagnostic commands, "config" for anything that
  // changes running-config. Omitting it (the bug this fixed) always got a 400 back.
  sendCommand: (id: string, command: string, mode: "exec" | "config" = "exec", params = {}) =>
    apiClient.post(`/device/${id}/command`, { command, mode, params }),

  fileTransfer: (id: string, data: Record<string, string>) =>
    apiClient.post(`/device/${id}/file-transfer`, data),

  getCommandStatus: (id: string, requestId: string) =>
    apiClient.get(`/device/${id}/command/${requestId}`),

  getCommandLogs: (id: string, limit = 50) =>
    apiClient.get(`/device/${id}/command-logs`, { params: { limit } }),

  getVlans: (id: string) => apiClient.get(`/device/${id}/vlan`),

  // vlanId also accepts a range string (e.g. "2-10") to create multiple VLANs in one command;
  // `name` only applies to a single-VLAN create.
  createVlan: (id: string, vlanId: number | string, name?: string) =>
    apiClient.post(`/device/${id}/vlan`, { vlanId, name }),

  updateVlan: (id: string, vlanId: number, data: { name: string }) =>
    apiClient.patch(`/device/${id}/vlan/${vlanId}`, data),

  // vlanId also accepts a range string (e.g. "2-10") to delete multiple VLANs in one command.
  // force=true skips the device command and only removes the platform record — for VLANs that
  // have already drifted off the switch and will always be rejected by a normal delete.
  deleteVlan: (id: string, vlanId: number | string, force?: boolean) =>
    apiClient.delete(`/device/${id}/vlan/${vlanId}${force ? "?force=true" : ""}`),

  getPorts: (id: string) => apiClient.get(`/device/${id}/ports`),

  // `target` is a single port name or a list of names for a bulk/interface-range edit. Every
  // field below is pushed live to the device. The response's `data.results` reports per-field
  // switch acceptance — a 422 means at least one field was rejected, but any field that *did*
  // succeed is still reflected in `data.ports`.
  updatePort: (
    id: string,
    target: string | string[],
    data: {
      description?: string | null;
      portType?: "access" | "trunk" | "hybrid";
      vlanId?: number;
      adminStatus?: "up" | "down";
      speed?: "auto" | "10" | "100" | "1000";
      duplex?: "auto" | "full" | "half";
      flowControl?: "on" | "off";
      mtu?: number;
      medium?: "copper" | "fiber";
      sfpMode?: "sgmii" | "2500BASE-X" | "1000BASE-X" | "10G" | null;
      autoneg?: "on" | "off";
      // "all" | "none" | a VLAN_LIST, e.g. "2,5-10"
      trunkAllowedVlan?: string;
      hybridAllowedVlan?: string;
      hybridUntaggedVlan?: string;
      lacpPortPriority?: number;
      lacpTimeout?: "long" | "short";
      poeEnabled?: boolean;
      // TR models only — see getDeviceCapabilities.loopDetection/stp, and confirmed live
      // against a real TR-MS2910-P terminal (see commands/poe/tr.ts).
      poePriority?: "low" | "medium" | "high";
      poeMaxPower?: number | null;
      poeForceOn?: boolean;
      poeLegacyMode?: boolean;
      poePdDescription?: string | null;
      // "none" clears detection; "by-ping" requires poePdDetectPeerIp. interval/times must be
      // sent together (5-60s / 3-30 count) — the switch sets both in one command.
      poePdDetectMode?: "none" | "by-flow" | "by-ping";
      poePdDetectPeerIp?: string;
      poePdDetectInterval?: number;
      poePdDetectTimes?: number;
      loopDetectEnabled?: boolean;
      loopDetectAction?: "alarm" | "error-down";
      loopDetectVlans?: string | null;
      stpPriority?: number;
      stpPathCost?: number | null;
      stpEdgePort?: "edgeport" | "autoedge" | null;
      stpBpduGuard?: boolean;
      // "switchport port-security" — TR models only, distinct from Port Security's IP-MAC
      // binding feature. Confirmed live against a real TR-MS2910-P terminal.
      portSecurityEnabled?: boolean;
      portSecurityAgingStatic?: boolean;
      portSecurityAgingTime?: number | null; // minutes, 0-1440
      portSecurityStickyMac?: boolean;
      portSecurityMaximum?: number | null; // 1-1024
      portSecurityViolationMode?: "restrict" | "shutdown" | null;
    }
  ) =>
    apiClient.patch(
      `/device/${id}/ports`,
      Array.isArray(target) ? { names: target, ...data } : { name: target, ...data }
    ),

  getRoutes: (id: string) => apiClient.get(`/device/${id}/route-config`),

  createRoute: (
    id: string,
    data: {
      isDefaultRoute?: boolean;
      destIpSegment?: string;
      destIpMask?: string;
      interfaceType?: string;
      forwardingRoutingAddress?: string;
      distanceMetric?: number;
      routingTag?: number;
      description?: string;
    }
  ) => apiClient.post(`/device/${id}/route-config`, data),

  // force=true skips the device command and only removes the platform record — for routes that
  // have already drifted off the switch and will always be rejected by a normal delete.
  deleteRoute: (id: string, routeId: string, force?: boolean) =>
    apiClient.delete(`/device/${id}/route-config/${routeId}${force ? "?force=true" : ""}`),

  // "switchport port-security mac-address" (TR only) — individually-configured secure MAC
  // entries per port. No VLAN argument (confirmed live).
  getPortSecurityMacs: (id: string) => apiClient.get(`/device/${id}/port-security-macs`),

  createPortSecurityMac: (id: string, data: { port: string; macAddress: string; sticky?: boolean }) =>
    apiClient.post(`/device/${id}/port-security-macs`, data),

  deletePortSecurityMac: (id: string, entryId: string) =>
    apiClient.delete(`/device/${id}/port-security-macs/${entryId}`),

  getDhcpPools: (id: string) => apiClient.get(`/device/${id}/dhcp-pool`),

  createDhcpPool: (
    id: string,
    data: {
      gateway: string;
      netmask: string;
      leasePeriod: "forever" | "custom";
      leaseDays?: number;
      leaseHours?: number;
      leaseMinutes?: number;
      dns: string;
      backupDns?: string;
      option43?: string;
      addressSegments: { start: string; end: string }[];
    }
  ) => apiClient.post(`/device/${id}/dhcp-pool`, data),

  deleteDhcpPool: (id: string, poolId: string) =>
    apiClient.delete(`/device/${id}/dhcp-pool/${poolId}`),

  updateDhcpPoolStatus: (id: string, poolId: string, value: "enabled" | "disabled") =>
    apiClient.patch(`/device/${id}/dhcp-pool/${poolId}/status`, { value }),

  updateDhcpPoolNakStatus: (id: string, poolId: string, value: "enabled" | "disabled") =>
    apiClient.patch(`/device/${id}/dhcp-pool/${poolId}/nak-status`, { value }),

  getLinkAggregations: (id: string) => apiClient.get(`/device/${id}/link-aggregation`),

  createLinkAggregation: (
    id: string,
    data: { groupId: number; mode: "static" | "active" | "passive"; memberPorts: string[] }
  ) => apiClient.post(`/device/${id}/link-aggregation`, data),

  deleteLinkAggregation: (id: string, laId: string) =>
    apiClient.delete(`/device/${id}/link-aggregation/${laId}`),

  getLoadBalanceMethod: (id: string) => apiClient.get(`/device/${id}/link-aggregation/load-balance`),

  updateLoadBalanceMethod: (id: string, method: string) =>
    apiClient.patch(`/device/${id}/link-aggregation/load-balance`, { method }),

  getLacpSystemPriority: (id: string) => apiClient.get(`/device/${id}/link-aggregation/system-priority`),

  updateLacpSystemPriority: (id: string, priority: number) =>
    apiClient.patch(`/device/${id}/link-aggregation/system-priority`, { priority }),

  getL3Interfaces: (id: string) => apiClient.get(`/device/${id}/l3-interfaces`),

  // confirm must be true — setting an L3 address can change the device's management
  // reachability (see CLI reference notes on SVI config).
  setL3Address: (
    id: string,
    data: {
      interfaceKind: "svi" | "routedPort";
      vlanId?: number;
      port?: string;
      ipv4Address?: string;
      ipv6Address?: string;
      confirm: true;
    }
  ) => apiClient.post(`/device/${id}/l3-interfaces`, data),

  deleteL3Address: (id: string, l3Id: string) =>
    apiClient.delete(`/device/${id}/l3-interfaces/${l3Id}`, { data: { confirm: true } }),

  // No secondary-address methods — live testing showed re-running "ip address" replaces the
  // primary instead of adding a secondary; there's no confirmed command for it (see
  // l3InterfaceController.ts).

  getPoeSettings: (id: string) => apiClient.get(`/device/${id}/poe`),

  updatePoePowerBudget: (id: string, watts: number | null) =>
    apiClient.patch(`/device/${id}/poe/power-budget`, { watts }),

  // confirm must be true when enabling legacy mode — the switch itself warns this can damage a
  // connected device on a port not attached to a PD. AC5-only (global) — rejected with 400 on
  // models (TR) that do legacy mode per-port instead; see getPoeSettings' legacyModeGlobal flag.
  updatePoeLegacyMode: (id: string, enabled: boolean, confirm?: true) =>
    apiClient.patch(`/device/${id}/poe/legacy-mode`, { enabled, ...(confirm ? { confirm } : {}) }),

  // TR models only — see getPoeSettings' powerAlarmPercent/powerReservedPercent presence.
  updatePoePowerAlarm: (id: string, percent: number | null) =>
    apiClient.patch(`/device/${id}/poe/power-alarm`, { percent }),

  updatePoePowerReserved: (id: string, percent: number) =>
    apiClient.patch(`/device/${id}/poe/power-reserved`, { percent }),

  getSystemSettings: (id: string) => apiClient.get(`/device/${id}/system`),

  updateHostname: (id: string, hostname: string | null) =>
    apiClient.patch(`/device/${id}/system/hostname`, { hostname }),

  updateNtpServer: (id: string, ntpServer: string) =>
    apiClient.patch(`/device/${id}/system/ntp`, { ntpServer }),

  updateTimezone: (id: string, timezone: string) =>
    apiClient.patch(`/device/${id}/system/timezone`, { timezone }),

  updateWebServer: (id: string, mode: "all" | "http" | "https" | null) =>
    apiClient.patch(`/device/${id}/system/web-server`, { mode }),

  updateTelnetServer: (id: string, enabled: boolean) =>
    apiClient.patch(`/device/${id}/system/telnet-server`, { enabled }),

  updateSshServer: (id: string, enabled: boolean) =>
    apiClient.patch(`/device/${id}/system/ssh-server`, { enabled }),

  // confirm must be true — changing the management IP can disconnect this platform from the device.
  updateManagementIp: (
    id: string,
    data: { vlanId: number; mode: "static" | "dhcp"; ip?: string; gateway?: string; confirm: true }
  ) => apiClient.patch(`/device/${id}/system/management-ip`, data),

  // confirm must be true — changing the management IP can disconnect this platform from the device.
  updateManagementIpv6: (
    id: string,
    data: { vlanId: number; mode: "static" | "dhcp"; ip?: string; gateway?: string; confirm: true }
  ) => apiClient.patch(`/device/${id}/system/management-ipv6`, data),

  writeConfig: (id: string) => apiClient.post(`/device/${id}/system/write`),

  // confirm must be true — reboots the device.
  reloadDevice: (id: string) => apiClient.post(`/device/${id}/system/reload`, { confirm: true }),

  // confirm must be true — wipes the device's configuration back to factory defaults.
  factoryRestore: (id: string) => apiClient.post(`/device/${id}/system/factory-restore`, { confirm: true }),

  // TR models only — commands.loopDetect is undefined on models without it (e.g. AC5); the
  // GET response's `supported` field reflects this before you try any of the PATCH endpoints.
  getLoopDetectSettings: (id: string) => apiClient.get(`/device/${id}/loop-detect`),

  updateLoopDetectGlobal: (id: string, enabled: boolean) =>
    apiClient.patch(`/device/${id}/loop-detect/global`, { enabled }),

  updateLoopDetectInterval: (id: string, seconds: number) =>
    apiClient.patch(`/device/${id}/loop-detect/interval`, { seconds }),

  updateLoopDetectTrap: (id: string, enabled: boolean) =>
    apiClient.patch(`/device/${id}/loop-detect/trap`, { enabled }),

  updateErrdisableTimeout: (id: string, enabled: boolean, interval?: number) =>
    apiClient.patch(`/device/${id}/loop-detect/errdisable-timeout`, { enabled, ...(interval !== undefined ? { interval } : {}) }),

  recoverErrdisablePort: (id: string, port: string) =>
    apiClient.post(`/device/${id}/loop-detect/recover`, { port }),

  // TR models only — commands.stp is undefined on models without it (e.g. AC5); the GET
  // response's `supported` field reflects this before you try any of the PATCH endpoints.
  getStpSettings: (id: string) => apiClient.get(`/device/${id}/stp`),

  updateStpMode: (id: string, mode: "stp" | "rstp" | "mstp") =>
    apiClient.patch(`/device/${id}/stp/mode`, { mode }),

  updateStpEnabled: (id: string, enabled: boolean) =>
    apiClient.patch(`/device/${id}/stp/enabled`, { enabled }),

  updateStpTimers: (
    id: string,
    data: { priority?: number; helloTime?: number; forwardDelay?: number; maxAge?: number }
  ) => apiClient.patch(`/device/${id}/stp/timers`, data),

  getAllOrgs: () => apiClient.get("/orgs/all"),

  createOrg: (name: string) => apiClient.post("/orgs/create-orgs", { name }),

  getOrgDetails: (orgId: string) => apiClient.get(`/orgs/${orgId}/details`),

  getOrgUsers: (orgId: string) => apiClient.get(`/orgs/${orgId}/users`),

  getAllDepts: () => apiClient.get("/orgs/getAllDepartment"),

  createDept: (name: string) => apiClient.post("/dept/create-dept", { name }),

  register: (data: Record<string, string>) =>
    apiClient.post("/user/register", data),

  getAllUsers: () => apiClient.get("/user/all"),

  getAllAlarms: (params?: { status?: string; severity?: string; limit?: number; page?: number }) =>
    apiClient.get("/alarm", { params }),

  getAlarmSummary: () => apiClient.get("/alarm/summary"),

  // Real telemetry-derived traffic (Mbps) for the Dashboard's Network Overview chart — hourly
  // buckets over the last 24h, only for hours with actual telemetry (never fabricated).
  getNetworkOverview: () => apiClient.get("/dashboard/network-overview"),

  getDeviceAlarms: (id: string, limit = 50) =>
    apiClient.get(`/alarm/device/${id}`, { params: { limit } }),

  acknowledgeAlarm: (id: string) =>
    apiClient.patch(`/alarm/${id}/acknowledge`),

  resolveAlarm: (id: string) => apiClient.patch(`/alarm/${id}/resolve`),
};

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: "SUPERADMIN" | "ADMIN" | "USER";
  orgs?: { id: string; name: string } | null;
  dept?: { id: string; name: string } | null;
}

export const getUser = (): UserInfo | null => {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  return JSON.parse(raw);
};

export const canSendCommands = (): boolean => {
  const user = getUser();
  return user?.role === "SUPERADMIN" || user?.role === "ADMIN";
};

export const canOnboard = (): boolean => {
  const user = getUser();
  return user?.role === "SUPERADMIN" || user?.role === "ADMIN";
};

export default apiClient;
